"""
HTTP route handlers.

Routers:
  router     — static assets and SPA (no version prefix needed)
  api_router — versioned story generation API (mounted at /api/v1 by factory)

Routes:
  GET  /                        — serve frontend SPA
  POST /api/v1/stories          — ADK agent: stream illustrated story (SSE)
"""

import logging

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, field_validator

from app.config import FRONTEND_DIR
from app.server.auth_middleware import get_optional_user
from app.server.session_resolver import SessionResolver
from app.services.companion_context_loader import CompanionContextLoader
from app.services.image_pipeline import ImagePipeline
from app.services.stream_orchestrator import StoryStreamOrchestrator
from app.services.title_extractor import TitleExtractor

logger = logging.getLogger("chronicler")

router = APIRouter()
api_router = APIRouter()


@router.get("/")
async def serve_index():
    """Serve the main HTML page."""
    return FileResponse(str(FRONTEND_DIR / "index.html"))


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
    """Stream an illustrated story from the Elora ADK agent.

    Returns a Server-Sent Events stream with typed JSON events.
    """
    logger.info(
        "[Story] request_received has_auth=%s requested_session_id=%s",
        bool(http_request.headers.get("Authorization")),
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

    companion_ctx = await CompanionContextLoader().load(
        user_id=user_id,
        companion_session_id=request.companion_session_id,
        original_prompt=request.prompt,
        is_authenticated=is_authenticated,
    )

    pipeline = ImagePipeline(session_id)
    title_extractor = TitleExtractor(request.prompt)

    orchestrator = StoryStreamOrchestrator(
        user_id=user_id,
        session_id=session_id,
        store=store,
        pipeline=pipeline,
        title_extractor=title_extractor,
    )

    return StreamingResponse(
        orchestrator.run(
            prompt_text=companion_ctx.prompt_text,
            original_prompt=request.prompt,
            companion_context=companion_ctx,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Location": f"/api/v1/sessions/{session_id}",
        },
    )
