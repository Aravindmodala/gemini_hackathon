"""Integration tests for app/server/session_routes.py — REST API endpoints."""

import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport


# ── Helpers ───────────────────────────────────────────────────

def _create_test_app():
    """Create a test FastAPI app with mocked dependencies."""
    with patch("app.server.factory.is_firebase_ready", return_value=True), \
         patch("app.config.PROJECT_ID", "test-project"), \
         patch("app.server.factory.PROJECT_ID", "test-project"), \
         patch("app.server.factory.StaticFiles", return_value=MagicMock()), \
         patch("fastapi.FastAPI.mount"):
        from app import create_app
        return create_app()


@pytest.fixture
def test_app():
    """Fixture for test app."""
    return _create_test_app()


@pytest.fixture
async def client(test_app):
    """Async HTTP client for testing session routes."""
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ── GET /api/v1/sessions ──────────────────────────────────────

class TestListSessions:
    """Tests for GET /api/v1/sessions."""

    @pytest.mark.asyncio
    async def test_list_sessions_returns_session_list(self, client):
        """Authenticated request → returns session list."""
        mock_sessions = [
            {
                "session_id": "abc123",
                "title": "Dragon Tale",
                "status": "ended",
                "created_at": "2026-01-01T00:00:00",
                "updated_at": "2026-01-01T01:00:00",
                "interaction_count": 5,
                "preview": "Welcome, traveler",
            }
        ]

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.session_routes.SessionQueryService") as mock_store_cls:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}
            mock_store_cls.list_sessions.return_value = (mock_sessions, None)

            response = await client.get(
                "/api/v1/sessions",
                headers={"Authorization": "Bearer valid-token"},
            )

            assert response.status_code == 200
            data = response.json()
            assert "data" in data
            assert len(data["data"]) == 1
            assert data["data"][0]["session_id"] == "abc123"
            assert "meta" in data
            assert data["meta"]["has_next"] == False

    @pytest.mark.asyncio
    async def test_list_sessions_without_auth_returns_401(self, client):
        """No auth header → 401."""
        response = await client.get("/api/v1/sessions")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_sessions_with_invalid_token_returns_401(self, client):
        """Invalid token → 401."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.side_effect = ValueError("Invalid token")

            response = await client.get(
                "/api/v1/sessions",
                headers={"Authorization": "Bearer bad-token"},
            )

            assert response.status_code == 401


# ── GET /api/v1/sessions/{id} ─────────────────────────────────

class TestGetSession:
    """Tests for GET /api/v1/sessions/{session_id}."""

    @pytest.mark.asyncio
    async def test_get_session_returns_session_detail(self, client):
        """Existing session → returns session data."""
        mock_session = {
            "session_id": "abc123",
            "title": "Dragon Tale",
            "status": "ended",
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T01:00:00",
            "interactions": [{"role": "user", "text": "Hello"}],
        }

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.session_routes.SessionQueryService") as mock_store_cls:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}
            mock_store_cls.get_session.return_value = mock_session

            response = await client.get(
                "/api/v1/sessions/abc123",
                headers={"Authorization": "Bearer valid-token"},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["data"]["session_id"] == "abc123"
            assert data["data"]["title"] == "Dragon Tale"

    @pytest.mark.asyncio
    async def test_get_session_not_found_returns_404(self, client):
        """Non-existent session → 404."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.session_routes.SessionQueryService") as mock_store_cls:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}
            mock_store_cls.get_session.return_value = None

            response = await client.get(
                "/api/v1/sessions/nonexistent",
                headers={"Authorization": "Bearer valid-token"},
            )

            assert response.status_code == 404


# ── DELETE /api/v1/sessions/{id} ──────────────────────────────

class TestDeleteSession:
    """Tests for DELETE /api/v1/sessions/{session_id}."""

    @pytest.mark.asyncio
    async def test_delete_session_deletes_session(self, client):
        """Successful delete → returns 204 No Content."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.session_routes.SessionQueryService") as mock_store_cls:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}
            mock_store_cls.get_session.return_value = {"session_id": "abc123", "title": "Dragon Tale"}
            mock_store_cls.delete_session.return_value = True

            response = await client.delete(
                "/api/v1/sessions/abc123",
                headers={"Authorization": "Bearer valid-token"},
            )

            assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_session_failure_returns_500(self, client):
        """Delete failure → 500."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.session_routes.SessionQueryService") as mock_store_cls:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}
            mock_store_cls.get_session.return_value = {"session_id": "abc123", "title": "Dragon Tale"}
            mock_store_cls.delete_session.return_value = False

            response = await client.delete(
                "/api/v1/sessions/abc123",
                headers={"Authorization": "Bearer valid-token"},
            )

            assert response.status_code == 500


# ── PATCH /api/v1/sessions/{id} ──────────────────────────────

class TestUpdateSession:
    """Tests for PATCH /api/v1/sessions/{session_id}."""

    @pytest.mark.asyncio
    async def test_update_session_updates_title(self, client):
        """Valid title update → returns updated session data."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.session_routes.SessionQueryService") as mock_store_cls:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}
            mock_store_cls.get_session.return_value = {"session_id": "abc123", "title": "Dragon Tale"}
            mock_store_cls.update_session_title.return_value = True

            response = await client.patch(
                "/api/v1/sessions/abc123",
                headers={"Authorization": "Bearer valid-token"},
                json={"title": "New Title"},
            )

            assert response.status_code == 200
            assert "data" in response.json()
            assert response.json()["data"]["session_id"] == "abc123"

    @pytest.mark.asyncio
    async def test_update_session_with_empty_body_returns_422(self, client):
        """Empty body → 422 validation error."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}

            response = await client.patch(
                "/api/v1/sessions/abc123",
                headers={"Authorization": "Bearer valid-token"},
                json={},
            )

            assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_session_failure_returns_500(self, client):
        """Update failure → 500."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.session_routes.SessionQueryService") as mock_store_cls:
            mock_verify.return_value = {"uid": "test-user-123", "email": "test@example.com"}
            mock_store_cls.get_session.return_value = {"session_id": "abc123", "title": "Dragon Tale"}
            mock_store_cls.update_session_title.return_value = False

            response = await client.patch(
                "/api/v1/sessions/abc123",
                headers={"Authorization": "Bearer valid-token"},
                json={"title": "New Title"},
            )

            assert response.status_code == 500
