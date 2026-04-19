"""Integration tests for app/server/user_routes.py — user profile and onboarding endpoints."""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

from app.domain.user import UserPreferences, UserProfile


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


def _stub_profile(**overrides) -> UserProfile:
    """Return a default UserProfile, with optional overrides."""
    defaults = dict(
        uid="test-user-123",
        display_name="Test User",
        email="test@example.com",
        photo_url=None,
        onboarded_at=None,
        preferences=UserPreferences(),
    )
    defaults.update(overrides)
    return UserProfile(**defaults)


# ── Fixtures ──────────────────────────────────────────────────

@pytest.fixture
def test_app():
    """Fixture for test app."""
    return _create_test_app()


@pytest.fixture
async def client(test_app):
    """Async HTTP client for testing user routes."""
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ── GET /api/v1/users/me ──────────────────────────────────────

class TestGetMe:
    """Tests for GET /api/v1/users/me."""

    @pytest.mark.asyncio
    async def test_get_me_requires_auth(self, client):
        """No Authorization header → 401."""
        response = await client.get("/api/v1/users/me")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_returns_profile(self, client):
        """Authenticated request → 200 with profile fields."""
        profile = _stub_profile()

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.user_routes._store") as mock_store:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }
            mock_store.get_or_create.return_value = profile

            response = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": "Bearer test-token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["uid"] == "test-user-123"
        assert data["email"] == "test@example.com"
        assert data["onboarded_at"] is None

    @pytest.mark.asyncio
    async def test_get_me_creates_stub_from_claims(self, client):
        """get_or_create is called with display_name and email from token claims."""
        profile = _stub_profile()

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.user_routes._store") as mock_store:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }
            mock_store.get_or_create.return_value = profile

            await client.get(
                "/api/v1/users/me",
                headers={"Authorization": "Bearer test-token"},
            )

        mock_store.get_or_create.assert_called_once_with(
            "test-user-123",
            display_name="Test User",
            email="test@example.com",
            photo_url=None,
        )


# ── PUT /api/v1/users/me ─────────────────────────────────────

class TestPutMe:
    """Tests for PUT /api/v1/users/me."""

    @pytest.mark.asyncio
    async def test_put_me_requires_auth(self, client):
        """No Authorization header → 401."""
        response = await client.put(
            "/api/v1/users/me",
            json={"preferences": {"favorite_genres": ["Fantasy"]}},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_put_me_calls_upsert(self, client):
        """Valid body → 200 and _store.upsert is called."""
        profile = _stub_profile(
            preferences=UserPreferences(favorite_genres=["Fantasy"]),
        )

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.user_routes._store") as mock_store:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }
            mock_store.upsert.return_value = None
            mock_store.get_or_create.return_value = profile

            response = await client.put(
                "/api/v1/users/me",
                headers={"Authorization": "Bearer test-token"},
                json={"preferences": {"favorite_genres": ["Fantasy"]}},
            )

        assert response.status_code == 200
        mock_store.upsert.assert_called_once()

    @pytest.mark.asyncio
    async def test_put_me_rejects_invalid_genre(self, client):
        """Invalid genre in payload → 422."""
        with patch("app.server.auth_middleware.verify_id_token") as mock_verify:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }

            response = await client.put(
                "/api/v1/users/me",
                headers={"Authorization": "Bearer test-token"},
                json={"preferences": {"favorite_genres": ["NotAGenre"]}},
            )

        assert response.status_code == 422


# ── POST /api/v1/users/me/onboarding/complete ────────────────

class TestOnboardingComplete:
    """Tests for POST /api/v1/users/me/onboarding/complete."""

    @pytest.mark.asyncio
    async def test_onboarding_complete_requires_auth(self, client):
        """No Authorization header → 401."""
        response = await client.post(
            "/api/v1/users/me/onboarding/complete",
            json={"preferences": {}},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_onboarding_complete_calls_mark_onboarded(self, client):
        """Valid request → _store.mark_onboarded called with preferences."""
        now = datetime.now(timezone.utc)
        profile = _stub_profile(onboarded_at=now)

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.user_routes._store") as mock_store:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }
            mock_store.mark_onboarded.return_value = None
            mock_store.get_or_create.return_value = profile

            await client.post(
                "/api/v1/users/me/onboarding/complete",
                headers={"Authorization": "Bearer test-token"},
                json={"preferences": {"favorite_genres": ["Fantasy"]}},
            )

        mock_store.mark_onboarded.assert_called_once()
        call_kwargs = mock_store.mark_onboarded.call_args
        assert call_kwargs[0][0] == "test-user-123"

    @pytest.mark.asyncio
    async def test_onboarding_complete_returns_profile(self, client):
        """Onboarding complete → 200 with profile."""
        now = datetime.now(timezone.utc)
        profile = _stub_profile(onboarded_at=now)

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.user_routes._store") as mock_store:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }
            mock_store.mark_onboarded.return_value = None
            mock_store.get_or_create.return_value = profile

            response = await client.post(
                "/api/v1/users/me/onboarding/complete",
                headers={"Authorization": "Bearer test-token"},
                json={"preferences": {}},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["uid"] == "test-user-123"


# ── POST /api/v1/users/me/onboarding/skip ─────────────────────

class TestOnboardingSkip:
    """Tests for POST /api/v1/users/me/onboarding/skip."""

    @pytest.mark.asyncio
    async def test_onboarding_skip_requires_auth(self, client):
        """No Authorization header → 401."""
        response = await client.post("/api/v1/users/me/onboarding/skip")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_onboarding_skip_calls_mark_skipped(self, client):
        """Valid request → _store.mark_skipped called with uid."""
        now = datetime.now(timezone.utc)
        profile = _stub_profile(onboarded_at=now)

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.user_routes._store") as mock_store:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }
            mock_store.mark_skipped.return_value = None
            mock_store.get_or_create.return_value = profile

            await client.post(
                "/api/v1/users/me/onboarding/skip",
                headers={"Authorization": "Bearer test-token"},
            )

        mock_store.mark_skipped.assert_called_once_with("test-user-123")

    @pytest.mark.asyncio
    async def test_onboarding_skip_returns_profile(self, client):
        """Skip onboarding → 200 with profile."""
        now = datetime.now(timezone.utc)
        profile = _stub_profile(onboarded_at=now)

        with patch("app.server.auth_middleware.verify_id_token") as mock_verify, \
             patch("app.server.user_routes._store") as mock_store:
            mock_verify.return_value = {
                "uid": "test-user-123",
                "email": "test@example.com",
                "name": "Test User",
            }
            mock_store.mark_skipped.return_value = None
            mock_store.get_or_create.return_value = profile

            response = await client.post(
                "/api/v1/users/me/onboarding/skip",
                headers={"Authorization": "Bearer test-token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["uid"] == "test-user-123"
