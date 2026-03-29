"""REST API routes for session management.

All routes are mounted at /api/v1/sessions by factory.py.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, field_validator

from app.core.session_query_service import SessionQueryService
from app.server.auth_middleware import get_current_user

logger = logging.getLogger("chronicler")

router = APIRouter(prefix="/sessions", tags=["sessions"])


class UpdateTitleRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_must_be_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title must not be empty")
        if len(v) > 200:
            raise ValueError("title must be 200 characters or fewer")
        return v


@router.get("", status_code=200)
async def list_sessions(
    limit: int = Query(20, ge=1, le=100, description="Maximum number of sessions to return"),
    cursor: str | None = Query(None, description="Opaque pagination cursor from previous response"),
    user: dict = Depends(get_current_user),
):
    """List sessions for the authenticated user, ordered by most recently updated.

    Supports cursor-based pagination. Pass the `next_cursor` from a previous
    response to retrieve the next page.
    """
    uid = user["uid"]
    sessions, next_cursor = await asyncio.to_thread(
        SessionQueryService.list_sessions, uid, limit=limit, cursor=cursor
    )
    return {
        "data": sessions,
        "meta": {
            "has_next": next_cursor is not None,
            "next_cursor": next_cursor,
        },
    }


@router.get("/{session_id}", status_code=200)
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    """Get a single session with all interactions."""
    uid = user["uid"]
    session = await asyncio.to_thread(SessionQueryService.get_session, uid, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"data": session}


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a session. Returns 204 No Content on success."""
    uid = user["uid"]
    # Check existence first to distinguish 404 from 500
    session = await asyncio.to_thread(SessionQueryService.get_session, uid, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    success = await asyncio.to_thread(SessionQueryService.delete_session, uid, session_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete session")
    return Response(status_code=204)


@router.patch("/{session_id}", status_code=200)
async def update_session(
    session_id: str,
    body: UpdateTitleRequest,
    user: dict = Depends(get_current_user),
):
    """Update a session's title. Returns the updated session resource."""
    uid = user["uid"]
    # Verify session exists
    existing = await asyncio.to_thread(SessionQueryService.get_session, uid, session_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    success = await asyncio.to_thread(
        SessionQueryService.update_session_title, uid, session_id, body.title
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update session")
    # Return updated resource (re-fetch to get server-side updated_at)
    updated = await asyncio.to_thread(SessionQueryService.get_session, uid, session_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated session")
    return {"data": updated}
