"""Unit tests for app/server/auth_middleware.py — FastAPI auth dependencies."""

import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException


# ── Helpers ───────────────────────────────────────────────────

def _make_request(headers: dict | None = None) -> MagicMock:
    """Create a mock FastAPI Request with given headers."""
    request = MagicMock()
    request.headers = headers or {}
    return request


# ── get_current_user ──────────────────────────────────────────

class TestGetCurrentUser:
    """Tests for get_current_user() dependency."""

    @pytest.mark.asyncio
    async def test_get_current_user_with_valid_bearer_token_returns_user_dict(self):
        """Valid Bearer token → returns decoded user dict."""
        decoded = {"uid": "user-123", "email": "test@example.com"}
        request = _make_request({"Authorization": "Bearer valid-token"})

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.return_value = decoded

            from app.server.auth_middleware import get_current_user
            result = await get_current_user(request)

            assert result == decoded
            mock_verify.assert_called_once_with("valid-token")

    @pytest.mark.asyncio
    async def test_get_current_user_with_missing_authorization_header_raises_401(self):
        """No Authorization header → raises 401."""
        request = _make_request({})

        from app.server.auth_middleware import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

        assert exc_info.value.status_code == 401
        assert "Missing Authorization header" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_current_user_with_invalid_token_raises_401(self):
        """Invalid token → raises 401."""
        request = _make_request({"Authorization": "Bearer bad-token"})

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.side_effect = ValueError("Invalid Firebase ID token")

            from app.server.auth_middleware import get_current_user
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(request)

            assert exc_info.value.status_code == 401
            assert "Invalid Firebase ID token" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_current_user_with_malformed_header_no_bearer_raises_401(self):
        """Malformed header (no 'Bearer' prefix) → raises 401."""
        request = _make_request({"Authorization": "Token some-token"})

        from app.server.auth_middleware import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

        assert exc_info.value.status_code == 401
        assert "Invalid Authorization header format" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_current_user_with_only_bearer_no_token_raises_401(self):
        """Header with only 'Bearer' and no token → raises 401."""
        request = _make_request({"Authorization": "Bearer"})

        from app.server.auth_middleware import get_current_user
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

        assert exc_info.value.status_code == 401
        assert "Invalid Authorization header format" in exc_info.value.detail


# ── get_optional_user ─────────────────────────────────────────

class TestGetOptionalUser:
    """Tests for get_optional_user() dependency."""

    @pytest.mark.asyncio
    async def test_get_optional_user_with_valid_token_returns_user_dict(self):
        """Valid Bearer token → returns decoded user dict."""
        decoded = {"uid": "user-123", "email": "test@example.com"}
        request = _make_request({"Authorization": "Bearer valid-token"})

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.return_value = decoded

            from app.server.auth_middleware import get_optional_user
            result = await get_optional_user(request)

            assert result == decoded

    @pytest.mark.asyncio
    async def test_get_optional_user_with_no_header_returns_none(self):
        """No Authorization header → returns None (not an error)."""
        request = _make_request({})

        from app.server.auth_middleware import get_optional_user
        result = await get_optional_user(request)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_optional_user_with_invalid_token_raises_401(self):
        """Invalid token present → still raises 401."""
        request = _make_request({"Authorization": "Bearer bad-token"})

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.side_effect = ValueError("Invalid token")

            from app.server.auth_middleware import get_optional_user
            with pytest.raises(HTTPException) as exc_info:
                await get_optional_user(request)

            assert exc_info.value.status_code == 401


# ── verify_ws_token ───────────────────────────────────────────

class TestVerifyWsToken:
    """Tests for verify_ws_token()."""

    def test_verify_ws_token_with_valid_token_returns_user_dict(self):
        """Valid token → returns decoded dict."""
        decoded = {"uid": "ws-user-456", "email": "ws@example.com"}

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.return_value = decoded

            from app.server.auth_middleware import verify_ws_token
            result = verify_ws_token("valid-ws-token")

            assert result == decoded
            mock_verify.assert_called_once_with("valid-ws-token")

    def test_verify_ws_token_with_invalid_token_raises_value_error(self):
        """Invalid token → raises ValueError."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.side_effect = ValueError("Invalid token")

            from app.server.auth_middleware import verify_ws_token
            with pytest.raises(ValueError, match="Invalid token"):
                verify_ws_token("bad-ws-token")
