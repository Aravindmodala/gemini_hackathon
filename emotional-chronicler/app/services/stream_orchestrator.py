"""Story stream orchestrator — extracts the ADK→SSE→Firestore pipeline from routes.py.

Owns monotonic seq numbering, parallel image generation via ImagePipeline,
correct text splitting at image markers, title extraction, and Firestore persistence.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from google.genai import types as genai_types

from app.core.adk_session_manager import ADKSessionManager
from app.core.agent import runner, APP_NAME
from app.core.store import SessionStore
from app.prompts import ELORA_SYSTEM_PROMPT
from app.domain.events import ImageEvent, TextSegmentEvent, UserPromptEvent
from app.server.prompt_parser import (
    extract_image_prompts, has_partial_marker, split_text_at_markers,
)
from app.server.sse import format_sse_event
from app.services.companion_context_loader import CompanionContext
from app.services.image_pipeline import ImagePipeline, PendingImage
from app.services.title_extractor import TitleExtractor

logger = logging.getLogger("chronicler")

HEARTBEAT_INTERVAL_SECONDS = 5
ELORA_FLUSH_CHARS = 800


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StoryStreamOrchestrator:
    """Orchestrates a single story generation stream.

    Owns the ADK→SSE→Firestore pipeline with:
    - Monotonic seq numbering for all events
    - Parallel image generation via ImagePipeline
    - Correct text splitting at image markers
    - Title extraction and persistence
    """

    def __init__(
        self,
        *,
        user_id: str,
        session_id: str,
        store: SessionStore | None,
        pipeline: ImagePipeline,
        title_extractor: TitleExtractor,
    ) -> None:
        self._user_id = user_id
        self._session_id = session_id
        self._store = store
        self._pipeline = pipeline
        self._title = title_extractor
        self._seq = 0

    def _next_seq(self) -> int:
        seq = self._seq
        self._seq += 1
        return seq

    async def _store_event(self, event: UserPromptEvent | TextSegmentEvent | ImageEvent) -> None:
        if self._store:
            await asyncio.to_thread(self._store.append_event, event)

    async def _flush_v1(self, buf: list[str], chars: list[int]) -> None:
        if self._store and buf:
            await asyncio.to_thread(self._store.log_interaction, "elora", "".join(buf))
            buf.clear()
            chars[0] = 0

    async def _emit_text(self, text: str, seq: int, buf: list[str], chars: list[int]) -> str:
        await self._store_event(TextSegmentEvent(
            seq=seq, kind="text_segment", text=text, ts=_now_iso(),
        ))
        buf.append(text)
        chars[0] += len(text)
        return format_sse_event({"type": "text", "chunk": text})

    async def _emit_image(self, pending: PendingImage, seq: int, prompt: str) -> str:
        await self._store_event(ImageEvent(
            seq=seq, kind="image", blob_path=pending.blob_path or "",
            image_url=pending.image_url or "", image_prompt=prompt[:500],
            mime_type=pending.mime_type or "image/png",
            gcs_ok=pending.gcs_ok, ts=_now_iso(),
        ))
        return format_sse_event({"type": "image", "url": pending.image_url, "caption": ""})

    async def run(
        self,
        *,
        prompt_text: str,
        original_prompt: str,
        companion_context: CompanionContext,
    ) -> AsyncGenerator[str, None]:
        """Main entry point. Yields SSE event strings."""
        elora_buf: list[str] = []
        elora_chars: list[int] = [0]
        prompt_buffer = ""
        parts_seen = text_chunks_seen = images_emitted = 0
        thought_parts_skipped = image_prompts_processed = 0
        collector: asyncio.Task | None = None

        try:
            logger.info("[Story] stream_start user_id=%s session_id=%s", self._user_id, self._session_id)
            yield format_sse_event({"type": "session", "session_id": self._session_id})

            adk_manager = ADKSessionManager(runner, APP_NAME)
            await adk_manager.ensure_session_exists(self._user_id, self._session_id)

            if companion_context.applied and companion_context.proposed_title:
                self._title.set_title(companion_context.proposed_title)
                yield await self._title.persist_and_emit(
                    self._store, self._user_id, self._session_id,
                    brief=companion_context.proposed_brief or "",
                )

            if self._store:
                await asyncio.to_thread(self._store.log_interaction, "user", original_prompt)
            await self._store_event(UserPromptEvent(
                seq=self._next_seq(), kind="user_prompt", text=original_prompt, ts=_now_iso(),
            ))

            # --- LLM payload (Elora): system instruction lives on the agent; user turn is below. ---
            _reader_profile = prompt_text.lstrip().startswith("READER PROFILE")
            logger.info(
                "[Story][LLM] session_id=%s user_message_chars=%d elora_system_chars=%d "
                "reader_profile_prepended=%s",
                self._session_id,
                len(prompt_text),
                len(ELORA_SYSTEM_PROMPT),
                _reader_profile,
            )
            logger.info("[Story][LLM] user_message (full text sent as user role):\n%s", prompt_text)
            logger.debug(
                "[Story][LLM] elora_system_instruction (full text from elora.py):\n%s",
                ELORA_SYSTEM_PROMPT,
            )

            new_message = genai_types.Content(
                role="user", parts=[genai_types.Part(text=prompt_text)],
            )
            _SENTINEL = object()
            event_queue: asyncio.Queue = asyncio.Queue()

            async def _collect_events() -> None:
                try:
                    async for ev in runner.run_async(
                        user_id=self._user_id, session_id=self._session_id,
                        new_message=new_message,
                    ):
                        await event_queue.put(ev)
                finally:
                    await event_queue.put(_SENTINEL)

            collector = asyncio.create_task(_collect_events())

            while True:
                try:
                    adk_event = await asyncio.wait_for(event_queue.get(), timeout=HEARTBEAT_INTERVAL_SECONDS)
                except asyncio.TimeoutError:
                    yield format_sse_event({"type": "thinking"})
                    continue

                if adk_event is _SENTINEL:
                    if collector.done() and collector.exception():
                        raise collector.exception()
                    break
                if not adk_event.content or not adk_event.content.parts:
                    continue

                for part in adk_event.content.parts:
                    parts_seen += 1
                    if getattr(part, "thought", False):
                        thought_parts_skipped += 1
                        continue

                    if not self._title.emitted and not getattr(part, "text", None):
                        yield await self._title.persist_and_emit(self._store, self._user_id, self._session_id)

                    text_value = getattr(part, "text", None)
                    if text_value:
                        if not self._title.emitted:
                            feed_result = self._title.feed(text_value)
                            if not feed_result.resolved:
                                continue
                            yield await self._title.persist_and_emit(self._store, self._user_id, self._session_id)
                            text_value = feed_result.visible_text

                        if text_value:
                            prompt_buffer += text_value
                            if has_partial_marker(prompt_buffer):
                                continue

                            text_segments = split_text_at_markers(prompt_buffer)
                            img_prompts = extract_image_prompts(prompt_buffer)
                            prompt_buffer = ""

                            if not img_prompts:
                                combined = "".join(text_segments)
                                if combined.strip():
                                    text_chunks_seen += 1
                                    yield await self._emit_text(combined, self._next_seq(), elora_buf, elora_chars)
                            else:
                                for i, img_prompt in enumerate(img_prompts):
                                    image_prompts_processed += 1
                                    seq_text, seq_image = self._next_seq(), self._next_seq()
                                    self._pipeline.schedule(seq_image, img_prompt)

                                    segment = text_segments[i] if i < len(text_segments) else ""
                                    if segment.strip():
                                        text_chunks_seen += 1
                                        yield await self._emit_text(segment, seq_text, elora_buf, elora_chars)

                                    pending = await self._pipeline.await_seq(seq_image)
                                    if pending and pending.image_url:
                                        images_emitted += 1
                                        yield await self._emit_image(pending, seq_image, img_prompt)

                                trailing = text_segments[-1] if text_segments else ""
                                if trailing.strip() and len(text_segments) > len(img_prompts):
                                    text_chunks_seen += 1
                                    yield await self._emit_text(trailing, self._next_seq(), elora_buf, elora_chars)

                        if elora_chars[0] >= ELORA_FLUSH_CHARS:
                            await self._flush_v1(elora_buf, elora_chars)

                    if part.function_response:
                        result = part.function_response.response or {}
                        fn_name = part.function_response.name
                        if "error" in result:
                            logger.warning("[Story] Tool '%s' error: %s", fn_name, result["error"])
                            continue
                        if self._store:
                            await asyncio.to_thread(self._store.log_tool_call, fn_name, result)

            # Post-loop cleanup
            if not collector.done():
                collector.cancel()

            async for pending in self._pipeline.drain_all():
                if pending.image_url:
                    images_emitted += 1
                    yield await self._emit_image(pending, self._next_seq(), pending.prompt)

            if prompt_buffer:
                if has_partial_marker(prompt_buffer):
                    idx = prompt_buffer.rfind("[[IMAGE_PROMPT:")
                    prompt_buffer = prompt_buffer[:idx] if idx > 0 else ""
                if prompt_buffer.strip():
                    text_chunks_seen += 1
                    yield await self._emit_text(prompt_buffer, self._next_seq(), elora_buf, elora_chars)

            if not self._title.emitted:
                leftover = self._title.force_resolve()
                yield await self._title.persist_and_emit(self._store, self._user_id, self._session_id)
                if leftover.strip():
                    yield format_sse_event({"type": "text", "chunk": leftover})
                    elora_buf.append(leftover)

            await self._flush_v1(elora_buf, elora_chars)
            if self._store:
                await asyncio.to_thread(self._store.end_session)

            logger.info(
                "[Story] stream_complete user_id=%s session_id=%s parts_seen=%d "
                "thought_parts_skipped=%d text_chunks=%d images=%d "
                "image_prompts_processed=%d companion_context=%s",
                self._user_id, self._session_id, parts_seen,
                thought_parts_skipped, text_chunks_seen, images_emitted,
                image_prompts_processed, companion_context.applied,
            )
            if images_emitted == 0:
                logger.warning("[Story] no_images_emitted session_id=%s", self._session_id)
            yield format_sse_event({"type": "done"})

        except Exception as exc:
            await self._pipeline.cancel_all()
            if collector and not collector.done():
                collector.cancel()
            await self._flush_v1(elora_buf, elora_chars)
            if self._store:
                await asyncio.to_thread(self._store.end_session)
            logger.exception("[Story] stream_failure user_id=%s session_id=%s error=%s", self._user_id, self._session_id, exc)
            yield format_sse_event({"type": "error", "message": "Story generation failed. Please try again."})
