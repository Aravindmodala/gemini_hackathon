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

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from google.genai import types as genai_types
from pydantic import BaseModel, field_validator

from app.config import FRONTEND_DIR, IMAGE_CACHE_DIR, MUSIC_CACHE_DIR
from app.core.agent import runner, APP_NAME
from app.core.store import SessionStore
from app.server.auth_middleware import get_optional_user

logger = logging.getLogger("chronicler")

# ── Two routers ────────────────────────────────────────────────────────────────
# router:     static assets + SPA (no prefix — registered directly in factory)
# api_router: versioned story API (factory mounts under /api/v1)

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
    user_id: Optional[str] = None
    session_id: Optional[str] = None

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

    if is_authenticated:
        user_id = auth_user["uid"]
        store = SessionStore(user_id)
        if request.session_id:
            resumed = store.resume_session(request.session_id)
            if resumed:
                session_id = request.session_id
                session_decision = "resume"
            else:
                session_id = store.create_session()
                session_decision = "resume_miss_create"
        else:
            session_id = store.create_session()
            session_decision = "create"
    else:
        user_id = request.user_id or "anonymous"
        session_id = request.session_id or uuid.uuid4().hex
        session_decision = "anonymous_passthrough"

    logger.info(
        "[Story] resolved_user user_id=%s auth=%s",
        user_id,
        is_authenticated,
    )
    logger.info(
        "[Story] resolved_session session_id=%s decision=%s",
        session_id,
        session_decision,
    )

    async def event_stream():
        try:
            logger.info(
                "[Story] stream_start user_id=%s session_id=%s decision=%s",
                user_id,
                session_id,
                session_decision,
            )
            yield _sse({"type": "session", "session_id": session_id})

            # Ensure ADK session exists
            existing = await runner.session_service.get_session(
                app_name=APP_NAME,
                user_id=user_id,
                session_id=session_id,
            )
            if not existing:
                logger.info(
                    "[Story] adk_session_create user_id=%s session_id=%s",
                    user_id,
                    session_id,
                )
                await runner.session_service.create_session(
                    app_name=APP_NAME,
                    user_id=user_id,
                    session_id=session_id,
                )
            else:
                logger.info(
                    "[Story] adk_session_resume user_id=%s session_id=%s",
                    user_id,
                    session_id,
                )

            new_message = genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=request.prompt)],
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
                        yield _sse({"type": "text", "chunk": part.text})

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
                            yield _sse({
                                "type": "image",
                                "url": result["image_url"],
                                "caption": result.get("caption", ""),
                            })

                        elif fn_name == "generate_music" and "audio_url" in result:
                            yield _sse({
                                "type": "music",
                                "url": result["audio_url"],
                                "duration": result.get("duration_seconds", 33),
                            })

            logger.info(
                "[Story] stream_complete user_id=%s session_id=%s",
                user_id,
                session_id,
            )
            yield _sse({"type": "done"})

        except Exception as e:
            logger.exception(
                "[Story] stream_failure user_id=%s session_id=%s error=%s",
                user_id,
                session_id,
                e,
            )
            # Generic message to avoid leaking internal details to clients
            yield _sse({"type": "error", "message": "Story generation failed. Please try again."})


    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Location": f"/api/v1/sessions/{session_id}",
        },
    )


def _sse(payload: dict) -> str:
    """Format a dict as a Server-Sent Events data line."""
    return f"data: {json.dumps(payload)}\n\n"


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
