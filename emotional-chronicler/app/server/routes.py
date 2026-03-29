"""
HTTP route handlers.

Routers:
  router     — static assets and SPA (no version prefix needed)
  api_router — versioned story generation API (mounted at /api/v1 by factory)

Routes:
  GET  /                        — serve frontend SPA
  GET  /api/images/{filename}   — serve Imagen 4 generated images
  GET  /api/music/{filename}    — serve Lyria 2 generated music tracks
  POST /api/v1/stories          — ADK agent: stream illustrated story (SSE)
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from google.genai import types as genai_types
from pydantic import BaseModel, field_validator

from app.config import FRONTEND_DIR, IMAGE_CACHE_DIR, MUSIC_CACHE_DIR
from app.core.adk_session_manager import ADKSessionManager
from app.core.agent import runner, APP_NAME
from app.core.session_query_service import SessionQueryService
from app.core.store import SessionStore
from app.server.auth_middleware import get_optional_user
from app.server.session_resolver import SessionResolver
from app.server.sse import format_sse_event

logger = logging.getLogger("chronicler")

# ── Two routers ────────────────────────────────────────────────────────────────
# router:     static assets + SPA (no prefix — registered directly in factory)
# api_router: versioned story API (factory mounts under /api/v1)

# Flush Elora text to Firestore every ~800 characters to survive interruptions
ELORA_FLUSH_CHARS = 800

router = APIRouter()
api_router = APIRouter()


# ── Frontend SPA ──────────────────────────────────────────────────────────────

@router.get("/")
async def serve_index():
    """Serve the main HTML page."""
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# ── Request model ─────────────────────────────────────────────────────────────

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


# ── Illustrated story generation (ADK + Imagen 4 + Lyria 2) ──────────────────

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
      {"type": "session", "session_id": "..."}    — resolved session id
      {"type": "text",  "chunk": "..."}          — prose narrative chunk
      {"type": "image", "url": "/api/images/...", "caption": "..."}
      {"type": "music", "url": "/api/music/..."}
      {"type": "done"}                            — stream complete
      {"type": "error", "message": "..."}         — generation error (generic message)
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
                        prompt_text = f"{companion_context}\n\nThe traveler is ready. Begin the story now.\n\nOriginal prompt: {request.prompt}"
                        logger.info(
                            "[Story] companion_context_loaded session_id=%s",
                            request.companion_session_id,
                        )
                        # Update story session title from companion's proposal
                        if proposed_title:
                            if store:
                                await asyncio.to_thread(
                                    SessionQueryService.update_session_title,
                                    user_id,
                                    session_id,
                                    proposed_title,
                                )
                                logger.info("[Story] session_title_set title=%s", proposed_title)
                            yield format_sse_event({"type": "title", "title": proposed_title, "brief": proposed_brief or ""})

            # Log the user's prompt to Firestore
            if store:
                await asyncio.to_thread(store.log_interaction, "user", request.prompt)

            new_message = genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=prompt_text)],
            )

            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=new_message,
            ):
                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    # ── Text chunk ────────────────────────────
                    if part.text:
                        yield format_sse_event({"type": "text", "chunk": part.text})
                        elora_text_buffer.append(part.text)
                        elora_buffered_chars += len(part.text)
                        # Flush to Firestore periodically so content survives interruptions
                        if store and elora_buffered_chars >= ELORA_FLUSH_CHARS:
                            await asyncio.to_thread(store.log_interaction, "elora", "".join(elora_text_buffer))
                            elora_text_buffer.clear()
                            elora_buffered_chars = 0

                    # ── Tool response (image or music) ────────
                    elif part.function_response:
                        result = part.function_response.response or {}
                        fn_name = part.function_response.name

                        if "error" in result:
                            logger.warning(
                                "[Story] Tool '%s' error: %s", fn_name, result["error"]
                            )
                            continue

                        if fn_name == "generate_image" and "image_url" in result:
                            yield format_sse_event({
                                "type": "image",
                                "url": result["image_url"],
                                "caption": result.get("caption", ""),
                            })
                            # Log image tool call to Firestore
                            if store:
                                await asyncio.to_thread(store.log_tool_call, fn_name, result)

                        elif fn_name == "generate_music" and "audio_url" in result:
                            yield format_sse_event({
                                "type": "music",
                                "url": result["audio_url"],
                                "duration": result.get("duration_seconds", 33),
                            })
                            # Log music tool call to Firestore
                            if store:
                                await asyncio.to_thread(store.log_tool_call, fn_name, result)

            # Flush accumulated Elora text to Firestore
            if store and elora_text_buffer:
                await asyncio.to_thread(store.log_interaction, "elora", "".join(elora_text_buffer))

            # Mark session as ended
            if store:
                await asyncio.to_thread(store.end_session)

            logger.info(
                "[Story] stream_complete user_id=%s session_id=%s",
                user_id,
                session_id,
            )
            yield format_sse_event({"type": "done"})

        except Exception as e:
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


# ── Static asset serving ──────────────────────────────────────────────────────

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
    """Serve an Imagen 4 generated illustration."""
    path = (IMAGE_CACHE_DIR / filename).resolve()
    if not path.is_relative_to(IMAGE_CACHE_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(path), media_type="image/png")


@router.get(
    "/api/music/{filename}",
    summary="Serve a generated music track",
    tags=["assets"],
    responses={
        200: {"description": "Audio file (WAV or MP3)"},
        404: {"description": "Music file not found"},
    },
)
async def serve_music(filename: str):
    """Serve a Lyria 2 generated music track."""
    path = (MUSIC_CACHE_DIR / filename).resolve()
    if not path.is_relative_to(MUSIC_CACHE_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Music not found")
    media_type = "audio/wav" if filename.endswith(".wav") else "audio/mpeg"
    return FileResponse(str(path), media_type=media_type)
