"""Authentication dependencies for FastAPI routes.

Provides injectable dependencies for extracting and verifying
Firebase ID tokens from HTTP requests and WebSocket connections.
"""

import logging
from typing import Optional

from fastapi import HTTPException, Request

from app.core.firebase import verify_id_token

logger = logging.getLogger("chronicler")


async def get_current_user(request: Request) -> dict:
    """FastAPI dependency: extract and verify Bearer token from Authorization header.

    Usage::

        @router.get("/me")
        async def me(user: dict = Depends(get_current_user)):
            return user

    Args:
        request: The incoming FastAPI request.

    Returns:
        Decoded token dict containing at minimum ``uid``.

    Raises:
        HTTPException: 401 if the token is missing, malformed, or invalid.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    token = parts[1]
    try:
        decoded = verify_id_token(token)
        return decoded
    except ValueError as e:
        logger.warning(f"[Auth] Token verification failed: {e}")
        raise HTTPException(status_code=401, detail=str(e))


async def get_optional_user(request: Request) -> Optional[dict]:
    """FastAPI dependency: optionally extract user from Authorization header.

    Returns the decoded token if a valid Bearer token is present,
    or ``None`` if no Authorization header is provided. Still raises
    401 if a token *is* provided but is invalid.

    Args:
        request: The incoming FastAPI request.

    Returns:
        Decoded token dict or ``None``.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    # If a header IS present, it must be valid
    return await get_current_user(request)


def verify_ws_token(token: str) -> dict:
    """Verify a Firebase ID token for WebSocket connections.

    WebSocket connections pass the token as a query parameter
    rather than an Authorization header.

    Args:
        token: The Firebase ID token string.

    Returns:
        Decoded token dict containing at minimum ``uid``.

    Raises:
        ValueError: If the token is invalid, expired, or revoked.
    """
    return verify_id_token(token)
