"""
HTTP route handlers.

Routers:
  router     Ã¢â‚¬" static assets and SPA (no version prefix needed)
  api_router Ã¢â‚¬" versioned story generation API (mounted at /api/v1 by factory)

Routes:
  GET  /                        Ã¢â‚¬" serve frontend SPA
  GET  /api/images/{filename}   Ã¢â‚¬" serve generated images (inline from Gemini)
  POST /api/v1/stories          Ã¢â‚¬" ADK agent: stream illustrated story (SSE)
"""

import asyncio
import logging
import mimetypes
import uuid

import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from google.genai import types as genai_types
from pydantic import BaseModel, field_validator

from app.config import (
    FRONTEND_DIR,
    IMAGE_CACHE_DIR,
    generate_signed_url,
    get_gcs_bucket,
    upload_to_gcs,
)
from app.core.adk_session_manager import ADKSessionManager
from app.core.agent import runner, APP_NAME
from app.core.visual_engine import generate_image
from app.server.prompt_parser import extract_and_strip_prompts, has_partial_marker
from app.core.session_query_service import SessionQueryService
from app.core.store import SessionStore
from app.server.auth_middleware import get_optional_user
from app.server.session_resolver import SessionResolver
from app.server.sse import format_sse_event

logger = logging.getLogger("chronicler")

# Ã¢"â‚¬Ã¢"â‚¬ Two routers Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
# router:     static assets + SPA (no prefix Ã¢â‚¬" registered directly in factory)
# api_router: versioned story API (factory mounts under /api/v1)

# Flush Elora text to Firestore every ~800 characters to survive interruptions
ELORA_FLUSH_CHARS = 800

# Reject inline images larger than 20 MB to protect disk and GCS quota
MAX_IMAGE_BYTES = 20 * 1024 * 1024

# Send an SSE keep-alive ping every N seconds while waiting for the model
HEARTBEAT_INTERVAL_SECONDS = 5

# Canonical extension map for MIME types Gemini 3 Pro Image Preview emits.
# Avoids mimetypes.guess_extension() which is OS-registry-dependent on Windows.
_IMAGE_EXT_MAP = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_TITLE_MARKER_PREFIX = "[[TITLE:"
_TITLE_MARKER_SUFFIX = "]]"
_MAX_TITLE_BUFFER_CHARS = 1200

router = APIRouter()
api_router = APIRouter()



def _sanitize_title(raw_title: str) -> str:
    """Trim, normalize spacing, and bound title length."""
    title = re.sub(r"\s+", " ", (raw_title or "").strip())
    if len(title) > 160:
        title = title[:160].rstrip()
    return title


def _derive_fallback_title(prompt: str) -> str:
    """Derive a readable title from the user prompt."""
    cleaned = re.sub(r"\s+", " ", (prompt or "").strip())
    if not cleaned:
        return "Untitled Story"

    cleaned = re.sub(
        r"^(write|tell|create|generate)\s+(me\s+)?(a|an)?\s*story\s+(about|on)\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip(" .,:;!-")
    if not cleaned:
        return "Untitled Story"

    snippet = " ".join(cleaned.split()[:8]).strip(" .,:;!-")
    if not snippet:
        return "Untitled Story"
    return snippet[:80].rstrip(" .,:;!-").title() or "Untitled Story"


def _extract_title_marker_from_buffer(buffer: str) -> tuple[str | None, str, bool]:
    """Parse a leading [[TITLE: ...]] marker from buffered prose.

    Returns (title, visible_text, resolved):
      - resolved=False means keep buffering more chunks.
      - title=None with resolved=True means caller should use fallback title.
    """
    if not buffer:
        return None, "", False

    trimmed = buffer.lstrip()
    if not trimmed.startswith("[["):
        return None, buffer, True
    if _TITLE_MARKER_PREFIX.startswith(trimmed):
        return None, "", False
    if not trimmed.startswith(_TITLE_MARKER_PREFIX):
        return None, buffer, True

    marker_end = trimmed.find(_TITLE_MARKER_SUFFIX, len(_TITLE_MARKER_PREFIX))
    if marker_end == -1:
        if len(trimmed) > _MAX_TITLE_BUFFER_CHARS:
            return None, buffer, True
        return None, "", False

    raw_title = trimmed[len(_TITLE_MARKER_PREFIX):marker_end]
    parsed_title = _sanitize_title(raw_title)
    visible_text = trimmed[marker_end + len(_TITLE_MARKER_SUFFIX):].lstrip("\r\n")
    return parsed_title or None, visible_text, True


async def _persist_and_emit_title(
    *,
    store: SessionStore | None,
    user_id: str,
    session_id: str,
    title: str,
    brief: str = "",
) -> str:
    """Persist a session title when possible and return the SSE payload."""
    resolved_title = _sanitize_title(title) or "Untitled Story"
    if store:
        await asyncio.to_thread(
            SessionQueryService.update_session_title,
            user_id,
            session_id,
            resolved_title,
        )
        logger.info("[Story] session_title_set title=%s", resolved_title)
    return format_sse_event({"type": "title", "title": resolved_title, "brief": brief})


# Ã¢"â‚¬Ã¢"â‚¬ Frontend SPA Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬

@router.get("/")
async def serve_index():
    """Serve the main HTML page."""
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# Ã¢"â‚¬Ã¢"â‚¬ Request model Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬

class StoryRequest(BaseModel):
    prompt: str
    user_id: str | None = None
    session_id: str | None = None
    companion_session_id: str | None = None

    @field_validator("prompt")
    @classmethod
    def prompt_must_not_be_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("prompt must not be empty")
        if len(v) > 4000:
            raise ValueError("prompt must be 4000 characters or fewer")
        return v


# Ã¢"â‚¬Ã¢"â‚¬ Illustrated story generation (ADK + Gemini 3 Pro Image Preview) Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬

@api_router.post(
    "/stories",
    summary="Generate an illustrated story via SSE",
    response_class=StreamingResponse,
    tags=["stories"],
    responses={
        200: {"description": "SSE stream of story events (text, image, music, done, error)"},
        422: {"description": "Invalid request body"},
        429: {"description": "Rate limit exceeded"},
    },
)
async def generate_story(request: StoryRequest, http_request: Request):
    """
    Stream an illustrated story from the Elora ADK agent.

    Returns a Server-Sent Events stream. Each event is a JSON object with a `type`:
      {"type": "session", "session_id": "..."}    Ã¢â‚¬" resolved session id
      {"type": "text",  "chunk": "..."}          Ã¢â‚¬" prose narrative chunk
      {"type": "image", "url": "/api/images/...", "caption": "..."}
      {"type": "music", "url": "/api/music/..."}
      {"type": "done"}                            Ã¢â‚¬" stream complete
      {"type": "error", "message": "..."}         Ã¢â‚¬" generation error (generic message)
    """
    logger.info(
        "[Story] request_received has_auth=%s requested_user_id=%s requested_session_id=%s",
        bool(http_request.headers.get("Authorization")),
        request.user_id,
        request.session_id,
    )

    auth_user = await get_optional_user(http_request)
    is_authenticated = bool(auth_user)

    resolver = SessionResolver()
    user_id, session_id, store = await resolver.resolve(
        auth_user=auth_user,
        requested_session_id=request.session_id,
        session_title="Untitled Story",
        fallback_user_id=request.user_id or "anonymous",
    )

    logger.info(
        "[Story] resolved_user user_id=%s auth=%s",
        user_id,
        is_authenticated,
    )
    logger.info(
        "[Story] resolved_session session_id=%s",
        session_id,
    )

    async def event_stream():
        elora_text_buffer: list[str] = []
        elora_buffered_chars: int = 0
        title_emitted: bool = False
        direct_title_mode: bool = True
        title_buffer: str = ""
        parts_seen: int = 0
        text_chunks_seen: int = 0
        images_emitted: int = 0
        thought_parts_skipped: int = 0
        prompt_buffer: str = ""
        image_prompts_processed: int = 0
        companion_context_applied: bool = False
        try:
            logger.info(
                "[Story] stream_start user_id=%s session_id=%s",
                user_id,
                session_id,
            )
            yield format_sse_event({"type": "session", "session_id": session_id})

            # Ensure ADK session exists
            adk_manager = ADKSessionManager(runner, APP_NAME)
            await adk_manager.ensure_session_exists(user_id, session_id)

            # Load companion context if available
            prompt_text = request.prompt
            proposed_title: str | None = None
            proposed_brief: str | None = None
            if request.companion_session_id and is_authenticated:
                companion_store = SessionStore(user_id)
                resumed = await asyncio.to_thread(
                    companion_store.resume_session, request.companion_session_id
                )
                if resumed:
                    companion_context, proposed_title, proposed_brief = await asyncio.to_thread(
                        companion_store.get_companion_data
                    )
                    if companion_context:
                        prompt_text = (
                            f"{companion_context}\n\n"
                            "The traveler is ready. Begin the story now.\n"
                        )
                        if proposed_title:
                            prompt_text += (
                                f'The story title is already fixed as "{proposed_title}". '
                                "Do not emit a [[TITLE: ...]] marker. Begin directly with story prose.\n"
                            )
                        prompt_text += f"\nOriginal prompt: {request.prompt}"
                        companion_context_applied = True
                        logger.info(
                            "[Story] companion_context_loaded session_id=%s",
                            request.companion_session_id,
                        )
            if companion_context_applied:
                # Companion-driven stories use the companion title only.
                direct_title_mode = False
                resolved_title = _sanitize_title(proposed_title or "") or _derive_fallback_title(request.prompt)
                yield await _persist_and_emit_title(
                    store=store,
                    user_id=user_id,
                    session_id=session_id,
                    title=resolved_title,
                    brief=proposed_brief or "",
                )
                title_emitted = True

            # Log the user's prompt to Firestore
            if store:
                await asyncio.to_thread(store.log_interaction, "user", request.prompt)

            new_message = genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=prompt_text)],
            )

            # Ã¢"â‚¬Ã¢"â‚¬ Heartbeat + event queue pattern Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
            # runner.run_async with stream=False can block for 60+ seconds.
            # We collect events into an asyncio.Queue from a background task
            # and emit SSE keep-alive pings while waiting.
            _SENTINEL = object()
            event_queue: asyncio.Queue = asyncio.Queue()

            async def _collect_events():
                """Background task: push ADK events into the queue."""
                try:
                    async for event in runner.run_async(
                        user_id=user_id,
                        session_id=session_id,
                        new_message=new_message,
                    ):
                        await event_queue.put(event)
                finally:
                    await event_queue.put(_SENTINEL)

            collector = asyncio.create_task(_collect_events())

            while True:
                try:
                    event = await asyncio.wait_for(
                        event_queue.get(), timeout=HEARTBEAT_INTERVAL_SECONDS
                    )
                except asyncio.TimeoutError:
                    # No event yet Ã¢â‚¬" send a keep-alive ping
                    yield format_sse_event({"type": "thinking"})
                    continue

                if event is _SENTINEL:
                    # Check if collector raised an exception
                    if collector.done() and collector.exception():
                        raise collector.exception()
                    break

                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    parts_seen += 1
                    if getattr(part, "thought", False):
                        thought_parts_skipped += 1
                        continue

                    if not title_emitted and direct_title_mode and not getattr(part, "text", None):
                        resolved_title = _derive_fallback_title(request.prompt)
                        yield await _persist_and_emit_title(
                            store=store,
                            user_id=user_id,
                            session_id=session_id,
                            title=resolved_title,
                        )
                        title_emitted = True

                    # Ã¢"â‚¬Ã¢"â‚¬ Text chunk (with image prompt marker extraction) Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
                    text_value = getattr(part, "text", None)
                    if text_value:
                        visible_text = text_value
                        if not title_emitted:
                            if direct_title_mode:
                                title_buffer += text_value
                                marker_title, parsed_text, resolved = _extract_title_marker_from_buffer(title_buffer)
                                if not resolved:
                                    continue
                                title_buffer = ""
                                resolved_title = marker_title or _derive_fallback_title(request.prompt)
                                yield await _persist_and_emit_title(
                                    store=store,
                                    user_id=user_id,
                                    session_id=session_id,
                                    title=resolved_title,
                                )
                                title_emitted = True
                                visible_text = parsed_text
                            else:
                                # Defensive fallback: companion flow should already emit title.
                                resolved_title = _derive_fallback_title(request.prompt)
                                yield await _persist_and_emit_title(
                                    store=store,
                                    user_id=user_id,
                                    session_id=session_id,
                                    title=resolved_title,
                                )
                                title_emitted = True

                        if visible_text:
                            # Accumulate in prompt buffer for marker detection
                            prompt_buffer += visible_text

                            # Check for partial marker at end â€" keep buffering if so
                            if has_partial_marker(prompt_buffer):
                                continue

                            # Extract complete image prompt markers
                            cleaned_text, image_prompts = extract_and_strip_prompts(prompt_buffer)
                            prompt_buffer = ""

                            # Emit cleaned text
                            if cleaned_text.strip():
                                text_chunks_seen += 1
                                yield format_sse_event({"type": "text", "chunk": cleaned_text})
                                elora_text_buffer.append(cleaned_text)
                                elora_buffered_chars += len(cleaned_text)

                            # Generate images for each extracted image prompt marker
                            for ip in image_prompts:
                                image_prompts_processed += 1
                                logger.info("[Visual] Generating image %d: %.80s...", image_prompts_processed, ip)

                                result = await generate_image(ip)
                                if result is None:
                                    logger.warning("[Visual] Image generation failed, skipping")
                                    continue

                                image_bytes, mime = result
                                if len(image_bytes) > MAX_IMAGE_BYTES:
                                    logger.warning("[Image] Oversized image skipped (%d bytes)", len(image_bytes))
                                    continue

                                # Save + emit
                                ext = _IMAGE_EXT_MAP.get(mime, ".bin")
                                filename = f"{uuid.uuid4().hex}{ext}"
                                filepath = IMAGE_CACHE_DIR / filename
                                await asyncio.to_thread(filepath.write_bytes, image_bytes)

                                blob_path = f"images/{session_id}/{filename}"
                                image_url = f"/api/v1/assets/images/{session_id}/{filename}"
                                gcs_upload_ok = True
                                try:
                                    await asyncio.to_thread(upload_to_gcs, blob_path, image_bytes, mime)
                                except Exception as gcs_err:
                                    gcs_upload_ok = False
                                    logger.warning(
                                        "[Image] GCS upload failed session_id=%s filename=%s error=%s",
                                        session_id, filename, gcs_err,
                                    )

                                yield format_sse_event({"type": "image", "url": image_url, "caption": ""})
                                images_emitted += 1

                                # Flush preceding prose to Firestore BEFORE the image so that
                                # interactions are stored in correct narrative order on restore.
                                if store and elora_text_buffer:
                                    await asyncio.to_thread(
                                        store.log_interaction, "elora", "".join(elora_text_buffer)
                                    )
                                    elora_text_buffer.clear()
                                    elora_buffered_chars = 0

                                if store:
                                    await asyncio.to_thread(store.log_tool_call, "generated_image", {
                                        "image_url": image_url,
                                        "blob_path": blob_path,
                                        "image_prompt": ip[:500],
                                        "gcs_ok": gcs_upload_ok,
                                    })

                        # Flush to Firestore periodically so content survives interruptions
                        if store and elora_buffered_chars >= ELORA_FLUSH_CHARS:
                            await asyncio.to_thread(store.log_interaction, "elora", "".join(elora_text_buffer))
                            elora_text_buffer.clear()
                            elora_buffered_chars = 0

                    # Ã¢"â‚¬Ã¢"â‚¬ Tool response (music, or legacy image) Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
                    if part.function_response:
                        result = part.function_response.response or {}
                        fn_name = part.function_response.name

                        if "error" in result:
                            logger.warning(
                                "[Story] Tool '%s' error: %s", fn_name, result["error"]
                            )
                            continue

                        # Log any tool call to Firestore
                        if store:
                            await asyncio.to_thread(store.log_tool_call, fn_name, result)

            # Ensure collector is done (it should be, since _SENTINEL was received)
            if not collector.done():
                collector.cancel()

            # Flush any trailing prose that remained buffered for marker-span detection.
            if prompt_buffer:
                if has_partial_marker(prompt_buffer):
                    marker_start = prompt_buffer.rfind("[[IMAGE_PROMPT:")
                    prompt_buffer = prompt_buffer[:marker_start] if marker_start > 0 else ""
                cleaned_tail, _ = extract_and_strip_prompts(prompt_buffer)
                if cleaned_tail.strip():
                    text_chunks_seen += 1
                    yield format_sse_event({"type": "text", "chunk": cleaned_tail})
                    elora_text_buffer.append(cleaned_tail)
                    elora_buffered_chars += len(cleaned_tail)

            # Flush accumulated Elora text to Firestore
            if store and elora_text_buffer:
                await asyncio.to_thread(store.log_interaction, "elora", "".join(elora_text_buffer))

            if not title_emitted:
                marker_title, parsed_text, _ = _extract_title_marker_from_buffer(title_buffer)
                resolved_title = marker_title or _derive_fallback_title(request.prompt)
                yield await _persist_and_emit_title(
                    store=store,
                    user_id=user_id,
                    session_id=session_id,
                    title=resolved_title,
                )
                title_emitted = True
                if parsed_text:
                    yield format_sse_event({"type": "text", "chunk": parsed_text})
                    elora_text_buffer.append(parsed_text)
                elif title_buffer and not title_buffer.lstrip().startswith("[["):
                    yield format_sse_event({"type": "text", "chunk": title_buffer})
                    elora_text_buffer.append(title_buffer)

            # Mark session as ended
            if store:
                await asyncio.to_thread(store.end_session)

            logger.info(
                "[Story] stream_complete user_id=%s session_id=%s parts_seen=%d thought_parts_skipped=%d text_chunks=%d images=%d companion_context=%s",
                user_id,
                session_id,
                parts_seen,
                thought_parts_skipped,
                text_chunks_seen,
                images_emitted,
                companion_context_applied,
            )
            if images_emitted == 0:
                logger.warning(
                    "[Story] no_images_emitted session_id=%s model=%s prompt_len=%d companion_context=%s",
                    session_id,
                    getattr(runner.agent, "model", "unknown"),
                    len(request.prompt),
                    companion_context_applied,
                )
            yield format_sse_event({"type": "done"})

        except Exception as e:
            # Cancel collector if still running
            if 'collector' in locals() and not collector.done():
                collector.cancel()

            # Still flush whatever text we have and end the session
            if store:
                if elora_text_buffer:
                    await asyncio.to_thread(store.log_interaction, "elora", "".join(elora_text_buffer))
                await asyncio.to_thread(store.end_session)

            logger.exception(
                "[Story] stream_failure user_id=%s session_id=%s error=%s",
                user_id,
                session_id,
                e,
            )
            # Generic message to avoid leaking internal details to clients
            yield format_sse_event({"type": "error", "message": "Story generation failed. Please try again."})


    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Location": f"/api/v1/sessions/{session_id}",
        },
    )


# Ã¢"â‚¬Ã¢"â‚¬ Static asset serving Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬

@router.get(
    "/api/images/{filename}",
    summary="Serve a generated image",
    tags=["assets"],
    responses={
        200: {"description": "PNG image file"},
        404: {"description": "Image not found"},
    },
)
async def serve_image(filename: str):
    """Serve a generated illustration from local cache (legacy fallback)."""
    path = (IMAGE_CACHE_DIR / filename).resolve()
    if not path.is_relative_to(IMAGE_CACHE_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    media_type, _ = mimetypes.guess_type(str(path))
    return FileResponse(str(path), media_type=media_type or "application/octet-stream")


# Validation patterns for asset endpoint path parameters
_HEX_RE = re.compile(r"^[0-9a-f]{32}$")
_FILENAME_RE = re.compile(r"^[0-9a-f]{32}\.\w{2,4}$")


def _log_asset_marker(
    marker: str,
    *,
    session_id: str,
    filename: str,
    level: int = logging.INFO,
    **fields,
) -> None:
    """Emit deterministic structured markers for asset retrieval/regeneration paths."""
    sorted_items = sorted((k, v) for k, v in fields.items() if v is not None)
    suffix = " ".join(f"{k}={v}" for k, v in sorted_items)
    message = f"[Asset] marker={marker} session_id={session_id} filename={filename}"
    if suffix:
        message = f"{message} {suffix}"
    logger.log(level, message)


async def _regenerate_missing_asset_image(
    *,
    session_id: str,
    filename: str,
    blob_path: str,
    local_path,
) -> tuple[bytes, str] | None:
    """Try to regenerate a missing image from persisted interaction metadata."""
    resolved = await asyncio.to_thread(
        SessionQueryService.find_image_interaction_for_asset,
        session_id,
        filename,
        blob_path,
    )
    if not resolved:
        _log_asset_marker(
            "missing_blob",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            reason="interaction_not_found",
        )
        return None

    user_id = resolved.get("user_id")
    image_prompt = resolved.get("image_prompt")
    if not image_prompt:
        _log_asset_marker(
            "missing_blob",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            reason="image_prompt_missing",
            user_id=user_id,
        )
        return None

    result = await generate_image(image_prompt)
    if result is None:
        _log_asset_marker(
            "missing_blob",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            reason="regeneration_failed",
            user_id=user_id,
        )
        return None

    image_bytes, mime = result
    if len(image_bytes) > MAX_IMAGE_BYTES:
        _log_asset_marker(
            "missing_blob",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            reason="regeneration_oversized",
            bytes=len(image_bytes),
            user_id=user_id,
        )
        return None

    await asyncio.to_thread(local_path.write_bytes, image_bytes)

    upload_ok = True
    try:
        await asyncio.to_thread(upload_to_gcs, blob_path, image_bytes, mime)
    except Exception as gcs_err:
        upload_ok = False
        _log_asset_marker(
            "regenerated",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            gcs_upload="failed",
            error=gcs_err,
            user_id=user_id,
        )

    metadata_updated = False
    if user_id:
        metadata_updated = await asyncio.to_thread(
            SessionQueryService.mark_image_interaction_regenerated,
            user_id=user_id,
            session_id=session_id,
            filename=filename,
            blob_path=blob_path,
            image_prompt=image_prompt,
            mime_type=mime,
        )

    _log_asset_marker(
        "regenerated",
        session_id=session_id,
        filename=filename,
        user_id=user_id,
        gcs_upload="ok" if upload_ok else "failed",
        metadata_updated=metadata_updated,
    )
    return image_bytes, mime


@api_router.get(
    "/assets/images/{session_id}/{filename}",
    summary="Serve a story image via signed URL redirect",
    tags=["assets"],
    responses={
        302: {"description": "Redirect to a short-lived signed GCS URL"},
        200: {"description": "Image served from local cache (fallback)"},
        400: {"description": "Invalid path parameters"},
        404: {"description": "Image not found"},
    },
)
async def serve_asset_image(session_id: str, filename: str):
    """Serve a story image: local cache first, GCS signed URL redirect as fallback."""
    # Validate path parameters to prevent traversal
    if not _HEX_RE.match(session_id) or not _FILENAME_RE.match(filename):
        _log_asset_marker(
            "invalid_params",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
        )
        raise HTTPException(status_code=400, detail="Invalid path parameters")

    # Fast path: serve from local cache if available
    local_path = (IMAGE_CACHE_DIR / filename).resolve()
    cache_root = IMAGE_CACHE_DIR.resolve()
    if not local_path.is_relative_to(cache_root):
        _log_asset_marker(
            "invalid_params",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            reason="cache_path_escape",
        )
        raise HTTPException(status_code=400, detail="Invalid path parameters")
    if local_path.exists():
        media_type, _ = mimetypes.guess_type(str(local_path))
        _log_asset_marker("local_hit", session_id=session_id, filename=filename)
        return FileResponse(str(local_path), media_type=media_type or "application/octet-stream")

    blob_path = f"images/{session_id}/{filename}"

    # Generate a short-lived signed URL and redirect
    try:
        signed_url = await asyncio.to_thread(generate_signed_url, blob_path)
        try:
            bucket = await asyncio.to_thread(get_gcs_bucket)
            blob = bucket.blob(blob_path)
            if await asyncio.to_thread(blob.exists):
                _log_asset_marker("signed_redirect", session_id=session_id, filename=filename)
                return RedirectResponse(url=signed_url, status_code=302)

            if local_path.exists():
                media_type, _ = mimetypes.guess_type(str(local_path))
                _log_asset_marker("local_hit", session_id=session_id, filename=filename, source="signed_probe_fallback")
                return FileResponse(str(local_path), media_type=media_type or "application/octet-stream")
            _log_asset_marker(
                "missing_blob",
                session_id=session_id,
                filename=filename,
                level=logging.WARNING,
                source="signed_probe",
                reason="existing_only_policy",
            )
            raise HTTPException(status_code=404, detail="Image not found")
        except HTTPException:
            raise
        except Exception as exists_err:
            _log_asset_marker(
                "signed_redirect",
                session_id=session_id,
                filename=filename,
                level=logging.WARNING,
                verify_exists="failed",
                error=exists_err,
            )
            return RedirectResponse(url=signed_url, status_code=302)
    except Exception as e:
        _log_asset_marker(
            "signed_redirect",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            status="unavailable",
            error=e,
        )

    # Fallback path when credentials cannot sign URLs:
    # fetch bytes directly from GCS and serve through this API.
    try:
        bucket = await asyncio.to_thread(get_gcs_bucket)
        blob = bucket.blob(blob_path)
        exists = await asyncio.to_thread(blob.exists)
        if not exists:
            if local_path.exists():
                media_type, _ = mimetypes.guess_type(str(local_path))
                _log_asset_marker("local_hit", session_id=session_id, filename=filename, source="direct_gcs_fallback")
                return FileResponse(str(local_path), media_type=media_type or "application/octet-stream")
            _log_asset_marker(
                "missing_blob",
                session_id=session_id,
                filename=filename,
                level=logging.WARNING,
                source="direct_gcs",
                reason="existing_only_policy",
            )
            raise HTTPException(status_code=404, detail="Image not found")

        data = await asyncio.to_thread(blob.download_as_bytes)
        media_type = blob.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        await asyncio.to_thread(local_path.write_bytes, data)
        _log_asset_marker("direct_gcs", session_id=session_id, filename=filename)
        return Response(content=data, media_type=media_type)
    except HTTPException:
        raise
    except Exception as e:
        _log_asset_marker(
            "direct_gcs",
            session_id=session_id,
            filename=filename,
            level=logging.WARNING,
            status="failed",
            error=e,
        )
        raise HTTPException(status_code=404, detail="Image not found") from e


