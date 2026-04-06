"""
HTTP route handlers.

Routers:
  router     â€” static assets and SPA (no version prefix needed)
  api_router â€” versioned story generation API (mounted at /api/v1 by factory)

Routes:
  GET  /                        â€” serve frontend SPA
  GET  /api/images/{filename}   â€” serve generated images (inline from Gemini)
  POST /api/v1/stories          â€” ADK agent: stream illustrated story (SSE)
"""

import asyncio
import base64
import logging
import mimetypes
import uuid

import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from google.genai import types as genai_types
from pydantic import BaseModel, field_validator

from app.config import FRONTEND_DIR, IMAGE_CACHE_DIR, upload_to_gcs, generate_signed_url
from app.core.adk_session_manager import ADKSessionManager
from app.core.agent import runner, APP_NAME
from app.core.session_query_service import SessionQueryService
from app.core.store import SessionStore
from app.server.auth_middleware import get_optional_user
from app.server.session_resolver import SessionResolver
from app.server.sse import format_sse_event

logger = logging.getLogger("chronicler")

# â”€â”€ Two routers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# router:     static assets + SPA (no prefix â€” registered directly in factory)
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

_IMAGE_MARKER = "[[IMAGE]]"
_IMAGE_MARKER_LEN = len(_IMAGE_MARKER)   # 9
_IMAGE_TAIL_MAX = _IMAGE_MARKER_LEN - 1  # 8 — max chars of a partial marker

router = APIRouter()
api_router = APIRouter()


def _coerce_image_bytes(raw: bytes | str | None) -> bytes | None:
    """Normalize image payloads to raw bytes."""
    if raw is None:
        return None
    if isinstance(raw, bytes):
        return raw
    if isinstance(raw, str):
        try:
            return base64.b64decode(raw)
        except Exception:
            logger.warning("[Image] Failed to decode base64 inline image payload")
            return None
    logger.warning("[Image] Unsupported inline image payload type: %s", type(raw).__name__)
    return None


def _extract_inline_image(part: genai_types.Part) -> tuple[bytes, str] | None:
    """Extract image bytes + mime from an event part when available."""
    inline_data = getattr(part, "inline_data", None)
    if not inline_data:
        return None

    mime = (getattr(inline_data, "mime_type", None) or "").lower()
    if not mime.startswith("image/"):
        return None

    image_bytes = _coerce_image_bytes(getattr(inline_data, "data", None))
    if not image_bytes:
        return None

    return image_bytes, mime


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


def _split_text_on_image_markers(
    text: str, tail: str
) -> tuple[list[str | None], str]:
    """Split incoming text chunk on [[IMAGE]] markers, handling partial markers.

    Args:
        text: The incoming text chunk from the model.
        tail: Leftover partial-marker fragment from the previous chunk (≤8 chars).

    Returns:
        (segments, new_tail) where segments alternates between str (text) and
        None (image placeholder position), and new_tail is any unresolved
        partial marker fragment to carry into the next call.
    """
    combined = tail + text
    parts = combined.split(_IMAGE_MARKER)

    # Check if the tail of the last segment is a partial marker prefix
    last = parts[-1]
    new_tail = ""
    for i in range(_IMAGE_TAIL_MAX, 0, -1):
        if last.endswith(_IMAGE_MARKER[:i]):
            new_tail = _IMAGE_MARKER[:i]
            parts[-1] = last[:-i]
            break

    # Build result: text segments separated by None (marker positions)
    segments: list[str | None] = []
    for idx, part in enumerate(parts):
        segments.append(part)          # text segment (may be empty string)
        if idx < len(parts) - 1:
            segments.append(None)      # image placeholder position
    return segments, new_tail


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


# â”€â”€ Frontend SPA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/")
async def serve_index():
    """Serve the main HTML page."""
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# â”€â”€ Request model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ Illustrated story generation (ADK + Gemini 3 Pro Image Preview) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      {"type": "session", "session_id": "..."}    â€” resolved session id
      {"type": "text",  "chunk": "..."}          â€” prose narrative chunk
      {"type": "image", "url": "/api/images/...", "caption": "..."}
      {"type": "music", "url": "/api/music/..."}
      {"type": "done"}                            â€” stream complete
      {"type": "error", "message": "..."}         â€” generation error (generic message)
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
        companion_context_applied: bool = False
        image_text_tail: str = ""    # partial [[IMAGE]] marker buffered across chunks
        placeholder_count: int = 0   # number of [[IMAGE]] markers emitted as placeholders
        image_fill_count: int = 0    # number of actual images received (matches placeholder index)
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

            # â”€â”€ Heartbeat + event queue pattern â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                    # No event yet â€” send a keep-alive ping
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

                    # â”€â”€ Text chunk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                            text_chunks_seen += 1
                            # Split on [[IMAGE]] markers, emitting placeholders at the
                            # correct positions so the frontend can reserve image slots
                            # even though actual image data arrives later in the stream.
                            segments, image_text_tail = _split_text_on_image_markers(
                                visible_text, image_text_tail
                            )
                            for seg in segments:
                                if seg is None:
                                    yield format_sse_event({
                                        "type": "image_placeholder",
                                        "index": placeholder_count,
                                    })
                                    placeholder_count += 1
                                elif seg:
                                    yield format_sse_event({"type": "text", "chunk": seg})
                                    elora_text_buffer.append(seg)
                                    elora_buffered_chars += len(seg)
                        # Flush to Firestore periodically so content survives interruptions
                        if store and elora_buffered_chars >= ELORA_FLUSH_CHARS:
                            await asyncio.to_thread(store.log_interaction, "elora", "".join(elora_text_buffer))
                            elora_text_buffer.clear()
                            elora_buffered_chars = 0

                    # â”€â”€ Inline image (native Gemini 3 Pro Image Preview output) â”€â”€
                    extracted = _extract_inline_image(part)
                    if extracted:
                        image_bytes, mime = extracted

                        # Size guard â€” skip oversized images
                        if len(image_bytes) > MAX_IMAGE_BYTES:
                            logger.warning("[Image] Oversized inline image skipped (%d bytes)", len(image_bytes))
                            continue

                        # Derive extension and content type from the model's MIME type
                        ext = _IMAGE_EXT_MAP.get(mime, ".bin")
                        filename = f"{uuid.uuid4().hex}{ext}"

                        # Save to local cache
                        filepath = IMAGE_CACHE_DIR / filename
                        await asyncio.to_thread(filepath.write_bytes, image_bytes)
                        logger.info(
                            "[Image] Generated inline image: %s (%d bytes, %s) session_id=%s",
                            filename, len(image_bytes), mime, session_id,
                        )

                        # Upload to GCS for persistent storage (organized by session)
                        blob_path = f"images/{session_id}/{filename}"
                        image_url = f"/api/v1/assets/images/{session_id}/{filename}"
                        try:
                            await asyncio.to_thread(
                                upload_to_gcs, blob_path, image_bytes, mime
                            )
                            logger.info("[Image] Uploaded to GCS: %s", blob_path)
                        except Exception as gcs_err:
                            logger.warning("[Image] GCS upload failed, will serve locally: %s", gcs_err)

                        yield format_sse_event({
                            "type": "image",
                            "url": image_url,
                            "caption": "",
                            "index": image_fill_count,
                        })
                        images_emitted += 1
                        image_fill_count += 1
                        if store:
                            await asyncio.to_thread(store.log_tool_call, "inline_image", {
                                "image_url": image_url,
                                "blob_path": blob_path,
                                "position_index": image_fill_count - 1,
                            })

                    # â”€â”€ Tool response (music, or legacy image) â”€â”€â”€â”€â”€â”€â”€â”€
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

            # Flush any partial [[IMAGE]] marker tail that never resolved
            if image_text_tail:
                yield format_sse_event({"type": "text", "chunk": image_text_tail})
                elora_text_buffer.append(image_text_tail)
                image_text_tail = ""

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


# â”€â”€ Static asset serving â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        raise HTTPException(status_code=400, detail="Invalid path parameters")

    # Fast path: serve from local cache if available
    local_path = (IMAGE_CACHE_DIR / filename).resolve()
    if local_path.is_relative_to(IMAGE_CACHE_DIR.resolve()) and local_path.exists():
        media_type, _ = mimetypes.guess_type(str(local_path))
        return FileResponse(str(local_path), media_type=media_type or "application/octet-stream")

    # Generate a short-lived signed URL and redirect
    blob_path = f"images/{session_id}/{filename}"
    try:
        signed_url = await asyncio.to_thread(generate_signed_url, blob_path)
    except Exception as e:
        logger.warning("[Asset] Failed to generate signed URL for %s: %s", blob_path, e)
        raise HTTPException(status_code=404, detail="Image not found") from e

    return RedirectResponse(url=signed_url, status_code=302)
