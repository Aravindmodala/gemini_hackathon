"""
Pre-story companion route — conversational interaction with Elora before story generation.

POST /api/v1/companion streams Elora's response via the ADK companion_runner.
The companion uses Gemini 2.0 Flash to chat with the user, capture their emotions,
mood, and preferences, then proposes a story title and brief.

All interactions are logged to Firestore. When the user clicks "Start the Journey",
the frontend sends the companion session_id to POST /api/v1/stories, which loads
the companion context and injects it into the Gemini 3.1 Pro Preview story agent.

SSE event format:
  {"type": "text",  "chunk": "..."}    — streaming response token
  {"type": "done"}                     — response complete
  {"type": "error", "message": "..."}  — generation failure
"""

import asyncio
import json
import logging
import re

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from google.genai import types as genai_types
from pydantic import BaseModel, field_validator

from app.core.adk_session_manager import ADKSessionManager
from app.core.agent import companion_runner, APP_NAME
from app.server.auth_middleware import get_optional_user
from app.server.session_resolver import SessionResolver
from app.server.sse import format_sse_event
from app.services.user_preferences_loader import UserPreferencesLoader

logger = logging.getLogger("chronicler")

chat_router = APIRouter()


# ── Request model ──────────────────────────────────────────────────────────────

class CompanionRequest(BaseModel):
    message: str
    session_id: str | None = None

    @field_validator("message")
    @classmethod
    def message_must_not_be_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message must not be empty")
        if len(v) > 2000:
            raise ValueError("message must be 2000 characters or fewer")
        return v


# ── Pre-story companion endpoint ───────────────────────────────────────────────

@chat_router.post(
    "/companion",
    summary="Chat with Elora before story generation (SSE)",
    response_class=StreamingResponse,
    tags=["companion"],
    responses={
        200: {"description": "SSE stream of companion events (text, done, error)"},
        422: {"description": "Invalid request body"},
    },
)
async def companion_chat(request: CompanionRequest, http_request: Request):
    """
    Stream a conversational response from Elora as SSE.

    The companion (Gemini 2.0 Flash) captures the user's emotions and mood,
    then proposes a story title and brief. All interactions are logged to
    Firestore so the story agent can load them later.
    """
    auth_user = await get_optional_user(http_request)
    is_first_turn = request.session_id is None
    is_authenticated = bool(auth_user)

    resolver = SessionResolver()
    user_id, session_id, store = await resolver.resolve(
        auth_user=auth_user,
        requested_session_id=request.session_id,
        session_title="Companion Chat",
    )

    logger.info(
        "[Companion] request_received user_id=%s session_id=%s msg_len=%d",
        user_id,
        session_id,
        len(request.message),
    )

    # Log user interaction to Firestore
    if store:
        await asyncio.to_thread(store.log_interaction, "user", request.message)

    user_prefs_ctx = None
    if is_first_turn and is_authenticated:
        user_prefs_ctx = await UserPreferencesLoader().load(
            user_id=user_id,
            is_authenticated=is_authenticated,
        )

    async def event_stream():
        try:
            # Emit session id so the frontend can track it
            yield format_sse_event({"type": "session", "session_id": session_id})

            # Ensure the ADK session exists
            adk_manager = ADKSessionManager(companion_runner, APP_NAME)
            await adk_manager.ensure_session_exists(user_id, session_id)

            message_text = request.message
            if user_prefs_ctx and user_prefs_ctx.applied:
                message_text = (
                    f"{user_prefs_ctx.preamble}\n\n"
                    f"The traveler's message: {request.message}"
                )

            new_message = genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=message_text)],
            )

            full_response = ""

            async for event in companion_runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=new_message,
            ):
                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    if part.text:
                        full_response += part.text
                        yield format_sse_event({"type": "text", "chunk": part.text})

            # Log Elora's response to Firestore
            if store and full_response.strip():
                await asyncio.to_thread(store.log_interaction, "elora", full_response)

                # Check if response contains a story proposal
                proposal = _extract_proposal(full_response)
                if proposal:
                    await asyncio.to_thread(
                        store.log_companion_proposal,
                        title=proposal.get("title", ""),
                        brief=proposal.get("brief", ""),
                        emotions=proposal.get("emotions", []),
                        genre=proposal.get("genre", ""),
                        tone=proposal.get("tone", ""),
                    )

            logger.info("[Companion] stream_complete user_id=%s session_id=%s", user_id, session_id)
            yield format_sse_event({"type": "done"})

        except Exception as e:
            logger.exception(
                "[Companion] stream_failure user_id=%s session_id=%s error=%s",
                user_id,
                session_id,
                e,
            )
            yield format_sse_event({"type": "error", "message": "Failed to get a response. Please try again."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _extract_proposal(text: str) -> dict | None:
    """Extract a story proposal JSON from the companion's response.

    The prompt instructs Elora to wrap proposals in ```story_proposal ... ``` blocks.
    """
    match = re.search(r"```story_proposal\s*\n(.*?)\n```", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1).strip())
    except (json.JSONDecodeError, ValueError):
        logger.warning("[Companion] Failed to parse story proposal JSON")
        return None


