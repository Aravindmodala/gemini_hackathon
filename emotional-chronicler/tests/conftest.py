"""Shared test fixtures for The Emotional Chronicler backend tests.

Mocks external dependencies (firebase_admin, google.cloud.firestore,
google.genai, google.adk, etc.) at the sys.modules level BEFORE any app
code is imported, so tests can run without GCP credentials or network access.
"""

import sys
from unittest.mock import MagicMock, AsyncMock

# ── Must be set BEFORE importing any app.* modules ────────────────────────────

# dotenv (no-op in tests)
_dotenv = MagicMock()
_dotenv.load_dotenv = MagicMock()
sys.modules.setdefault("dotenv", _dotenv)

# ── Google GenAI SDK (used by config.py and tools) ────────────────────────────
_genai_mock = MagicMock()
_genai_client_instance = MagicMock()
_genai_mock.Client = MagicMock(return_value=_genai_client_instance)
sys.modules.setdefault("google.genai", _genai_mock)

_genai_types = MagicMock()
# Ensure Content and Part are constructable
_genai_types.Content = MagicMock(side_effect=lambda **kw: MagicMock(**kw))
_genai_types.Part = MagicMock(side_effect=lambda **kw: MagicMock(**kw))
_genai_types.GenerateImagesConfig = MagicMock(side_effect=lambda **kw: MagicMock(**kw))
sys.modules.setdefault("google.genai.types", _genai_types)

# ── Google ADK (used by agent.py) ─────────────────────────────────────────────
_adk_mock = MagicMock()
sys.modules.setdefault("google.adk", _adk_mock)

_adk_agents = MagicMock()
_adk_agents.Agent = MagicMock(return_value=MagicMock())
sys.modules.setdefault("google.adk.agents", _adk_agents)

_adk_runners = MagicMock()
_adk_runners.Runner = MagicMock(return_value=MagicMock())
sys.modules.setdefault("google.adk.runners", _adk_runners)

_adk_sessions = MagicMock()
_adk_sessions.InMemorySessionService = MagicMock(return_value=MagicMock())
sys.modules.setdefault("google.adk.sessions", _adk_sessions)

# ── Firebase Admin SDK ────────────────────────────────────────────────────────
_firebase_admin = MagicMock()
_firebase_admin.get_app = MagicMock(side_effect=ValueError("No app"))
_firebase_admin.initialize_app = MagicMock(return_value=MagicMock())
_firebase_admin.App = type("App", (), {})
sys.modules.setdefault("firebase_admin", _firebase_admin)

_firebase_auth = MagicMock()
_firebase_auth.InvalidIdTokenError = type("InvalidIdTokenError", (Exception,), {})
_firebase_auth.ExpiredIdTokenError = type("ExpiredIdTokenError", (Exception,), {})
_firebase_auth.RevokedIdTokenError = type("RevokedIdTokenError", (Exception,), {})
_firebase_auth.UserNotFoundError = type("UserNotFoundError", (Exception,), {})
sys.modules.setdefault("firebase_admin.auth", _firebase_auth)
sys.modules.setdefault("firebase_admin.credentials", MagicMock())
sys.modules.setdefault("firebase_admin._auth_utils", MagicMock())

# ── Google Cloud Firestore ─────────────────────────────────────────────────────
_firestore = MagicMock()
_firestore.Client = MagicMock()
_firestore.ArrayUnion = MagicMock(side_effect=lambda x: x)
_firestore.Query = MagicMock()
_firestore.Query.DESCENDING = "DESCENDING"
sys.modules.setdefault("google.cloud.firestore", _firestore)
sys.modules.setdefault("google.cloud", MagicMock())

# ── Google Auth (used by lyria.py) ────────────────────────────────────────────
# NOTE: We force-set these (not setdefault) because the `google` namespace
# package may already be partially loaded by installed packages like
# google-cloud-storage, causing setdefault to silently skip our mock.
_google_auth = MagicMock()
_mock_credentials = MagicMock()
_mock_credentials.token = "mock-access-token"
_mock_credentials.refresh = MagicMock()
_google_auth.default = MagicMock(return_value=(_mock_credentials, "mock-project"))

_google_auth_transport = MagicMock()
_google_auth_transport_requests = MagicMock()

sys.modules["google.auth"] = _google_auth
sys.modules["google.auth.credentials"] = MagicMock()
sys.modules["google.auth.transport"] = _google_auth_transport
sys.modules["google.auth.transport.requests"] = _google_auth_transport_requests
sys.modules.setdefault("google.oauth2", MagicMock())

# ── Now safe to import test dependencies ──────────────────────────────────────

import pytest
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport


@pytest.fixture(autouse=True)
def mock_firebase():
    """Mock Firebase Admin SDK singleton state for all tests."""
    with patch("app.core.firebase._firebase_available", True), \
         patch("app.core.firebase._firebase_app", MagicMock()):
        yield


@pytest.fixture
def mock_firestore_db():
    """Mock Firestore client."""
    with patch("app.core.store._get_db") as mock_get_db:
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        yield mock_db


@pytest.fixture
def mock_verify_token():
    """Mock Firebase token verification."""
    with patch("app.core.firebase.verify_id_token") as mock:
        mock.return_value = {
            "uid": "test-user-123",
            "email": "test@example.com",
            "name": "Test User",
        }
        yield mock


@pytest.fixture
def app():
    """Create test FastAPI app with mocked dependencies."""
    with patch("app.server.factory.is_firebase_ready", return_value=True), \
         patch("app.config.PROJECT_ID", "test-project"), \
         patch("app.server.factory.PROJECT_ID", "test-project"), \
         patch("app.server.factory.StaticFiles", return_value=MagicMock()), \
         patch("fastapi.FastAPI.mount"):
        from app import create_app
        return create_app()


@pytest.fixture
async def async_client(app):
    """Async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
