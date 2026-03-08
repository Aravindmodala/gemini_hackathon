"""
HTTP and WebSocket route handlers.

The routes are a thin shell — all agent logic lives in core/.
"""

import logging
import uuid

from fastapi import APIRouter, WebSocket
from fastapi.responses import FileResponse

from app.config import FRONTEND_DIR
from app.core.session import GeminiSession
from app.tools import tool_registry

logger = logging.getLogger("chronicler")

router = APIRouter()


@router.get("/")
async def serve_index():
    """Serve the main HTML page."""
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@router.websocket("/ws")
async def websocket_endpoint(client_ws: WebSocket):
    """
    Handle a browser WebSocket connection.

    Accepts an optional `user_id` query parameter for session continuity.
    If not provided, generates a random one (anonymous user).

    Example: ws://localhost:3001/ws?user_id=abc123
    """
    await client_ws.accept()

    # Extract user_id from query params (or generate one)
    user_id = client_ws.query_params.get("user_id") or uuid.uuid4().hex[:8]
    logger.info(f"[Server] Browser connected — user_id: {user_id}")

    session = GeminiSession(client_ws, tool_registry, user_id)
    await session.start()
