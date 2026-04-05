"""Integration tests for app/server/routes.py — HTTP routes.

Tests cover:
  GET  /                        — serve frontend SPA
  POST /api/v1/stories          — ADK agent SSE story stream
  GET  /api/images/{filename}   — serve Imagen 4 generated images
  GET  /api/music/{filename}    — serve Lyria 2 generated music
"""

import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from httpx import AsyncClient, ASGITransport


# ── Helpers ────────────────────────────────────────────────────────────────────

def _create_test_app():
    """Create a test FastAPI app with all external dependencies mocked."""
    with patch("app.server.factory.is_firebase_ready", return_value=True), \
         patch("app.config.PROJECT_ID", "test-project"), \
         patch("app.server.factory.PROJECT_ID", "test-project"), \
         patch("app.server.factory.StaticFiles", return_value=MagicMock()), \
         patch("fastapi.FastAPI.mount"):
        from app import create_app
        return create_app()


@pytest.fixture
def test_app():
    return _create_test_app()


@pytest.fixture
async def client(test_app):
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _make_text_event(text: str) -> MagicMock:
    """Create a mock ADK event with a text part."""
    part = MagicMock(spec=[])
    part.text = text
    part.thought = False
    part.function_response = None
    part.inline_data = None
    event = MagicMock()
    event.content = MagicMock()
    event.content.parts = [part]
    return event


def _make_image_event(image_url: str, caption: str) -> MagicMock:
    """Create a mock ADK event with a function_response for generate_image."""
    fn_resp = MagicMock()
    fn_resp.name = "generate_image"
    fn_resp.response = {"image_url": image_url, "caption": caption}

    part = MagicMock(spec=[])
    part.text = None
    part.thought = False
    part.function_response = fn_resp
    part.inline_data = None

    event = MagicMock()
    event.content = MagicMock()
    event.content.parts = [part]
    return event



def _make_empty_event() -> MagicMock:
    """Create a mock ADK event with no content."""
    event = MagicMock(spec=[])
    event.content = None
    return event


def _make_inline_image_event(image_bytes: bytes = b"\x89PNG\r\n\x1a\n", mime_type: str = "image/png") -> MagicMock:
    """Create a mock ADK event with native inline_data (Gemini 3 Pro Image Preview)."""
    inline_data = MagicMock()
    inline_data.data = image_bytes
    inline_data.mime_type = mime_type

    part = MagicMock()
    part.text = None
    part.thought = False
    part.function_response = None
    part.inline_data = inline_data
    # Make hasattr(part, 'inline_data') return True
    type(part).inline_data = inline_data

    event = MagicMock()
    event.content = MagicMock()
    event.content.parts = [part]
    return event


# ── format_sse_event helper ───────────────────────────────────────────────────

class TestSseHelper:
    def test_sse_formats_payload_as_data_line(self):
        from app.server.sse import format_sse_event
        result = format_sse_event({"type": "text", "chunk": "hello"})
        assert result.startswith("data: ")
        assert result.endswith("\n\n")
        parsed = json.loads(result[6:])
        assert parsed == {"type": "text", "chunk": "hello"}

    def test_sse_handles_nested_objects(self):
        from app.server.sse import format_sse_event
        payload = {"type": "image", "url": "/api/images/abc.png", "caption": "A forest"}
        result = format_sse_event(payload)
        parsed = json.loads(result[6:])
        assert parsed["type"] == "image"
        assert parsed["url"] == "/api/images/abc.png"


# ── GET / ─────────────────────────────────────────────────────────────────────

class TestServeIndex:
    @pytest.mark.asyncio
    async def test_get_root_returns_non_404(self, client):
        """GET / — endpoint exists (may 200 or 500 if file absent)."""
        with patch("app.server.routes.FileResponse") as mock_fr:
            mock_fr.return_value = MagicMock(status_code=200)
            response = await client.get("/")
        assert response.status_code != 404


# ── POST /api/v1/stories — SSE story stream ───────────────────────────────────

class TestGenerateStory:
    """Tests for POST /api/v1/stories (SSE stream)."""

    @staticmethod
    async def _sse_lines(response) -> list[dict]:
        """Parse SSE response content into list of JSON events."""
        events = []
        for line in response.text.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
        return events

    @pytest.mark.asyncio
    async def test_story_streams_text_events(self, client):
        """Text parts from ADK → text SSE events."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("Once upon a time")
            yield _make_text_event(" in a land far away")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Tell me a story"},
            )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        events = await self._sse_lines(response)
        text_events = [e for e in events if e.get("type") == "text"]
        assert len(text_events) == 2
        assert text_events[0]["chunk"] == "Once upon a time"
        assert text_events[1]["chunk"] == " in a land far away"

    @pytest.mark.asyncio
    async def test_story_streams_inline_image_event(self, client, tmp_path):
        """Native inline image from Gemini 3 Pro → image SSE event with GCS fallback."""
        async def mock_run_async(**kwargs):
            yield _make_inline_image_event()

        with patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path), \
             patch("app.server.routes.upload_to_gcs", side_effect=Exception("GCS unavailable")):
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "A story with pictures"},
            )

        events = await self._sse_lines(response)
        image_events = [e for e in events if e.get("type") == "image"]
        assert len(image_events) == 1
        assert "/api/v1/assets/images/" in image_events[0]["url"]
        assert image_events[0]["url"].endswith(".png")


    @pytest.mark.asyncio
    async def test_story_ends_with_done_event(self, client):
        """Stream always ends with a 'done' event."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("The end.")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "A short story"},
            )

        events = await self._sse_lines(response)
        assert events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_story_skips_empty_events(self, client):
        """Events with no content are silently skipped."""
        async def mock_run_async(**kwargs):
            yield _make_empty_event()
            yield _make_text_event("Real content")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Test"},
            )

        events = await self._sse_lines(response)
        text_events = [e for e in events if e.get("type") == "text"]
        assert len(text_events) == 1
        assert text_events[0]["chunk"] == "Real content"

    @pytest.mark.asyncio
    async def test_story_skips_tool_error_responses(self, client):
        """Tool responses with 'error' key are silently skipped."""
        fn_resp = MagicMock()
        fn_resp.name = "generate_image"
        fn_resp.response = {"error": "Imagen quota exceeded"}

        part = MagicMock(spec=[])
        part.text = None
        part.thought = False
        part.function_response = fn_resp
        part.inline_data = None

        event = MagicMock()
        event.content = MagicMock()
        event.content.parts = [part]

        async def mock_run_async(**kwargs):
            yield event

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Test"},
            )

        events = await self._sse_lines(response)
        # No image event, just done
        assert not any(e.get("type") == "image" for e in events)
        assert events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_story_returns_error_event_on_exception(self, client):
        """Runner exception → error SSE event."""
        async def mock_run_async(**kwargs):
            raise RuntimeError("ADK runner failed")
            yield  # make it a generator

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Test"},
            )

        events = await self._sse_lines(response)
        error_events = [e for e in events if e.get("type") == "error"]
        assert len(error_events) == 1
        assert "Story generation failed" in error_events[0]["message"]

    @pytest.mark.asyncio
    async def test_story_sse_emits_session_event_first(self, client):
        """Stream emits resolved session id event before text chunks."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("Hello")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Test", "session_id": "sess-xyz"},
            )

        events = await self._sse_lines(response)
        assert events[0]["type"] == "session"
        assert events[0]["session_id"] == "sess-xyz"

    @pytest.mark.asyncio
    async def test_story_parses_title_marker_before_text(self, client):
        """Direct flow parses [[TITLE: ...]] marker and strips it from prose."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("[[TITLE: Mosquito Man Rising]]\nLeo woke to the buzz of destiny.")

        mock_store = MagicMock()
        mock_store.create_session.return_value = "sess-title-1"

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "auth-user-1"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.SessionQueryService.update_session_title", return_value=True) as mock_update_title:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "write a story about mosquito man"},
            )

        events = await self._sse_lines(response)
        assert events[0]["type"] == "session"
        assert events[1]["type"] == "title"
        assert events[1]["title"] == "Mosquito Man Rising"

        text_events = [e for e in events if e.get("type") == "text"]
        assert len(text_events) == 1
        assert text_events[0]["chunk"] == "Leo woke to the buzz of destiny."
        assert "[[TITLE:" not in text_events[0]["chunk"]
        mock_update_title.assert_called_once()

    @pytest.mark.asyncio
    async def test_story_parses_title_marker_split_across_chunks(self, client):
        """Direct flow keeps buffering until a split title marker is complete."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("[[TI")
            yield _make_text_event("TLE: Neon Wings]]\nThe city never slept.")

        mock_store = MagicMock()
        mock_store.create_session.return_value = "sess-title-split"

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "auth-user-split"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.SessionQueryService.update_session_title", return_value=True) as mock_update_title:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "write a story about neon wings"},
            )

        events = await self._sse_lines(response)
        title_events = [e for e in events if e.get("type") == "title"]
        text_events = [e for e in events if e.get("type") == "text"]

        assert len(title_events) == 1
        assert title_events[0]["title"] == "Neon Wings"
        assert text_events == [{"type": "text", "chunk": "The city never slept."}]
        mock_update_title.assert_called_once()

    @pytest.mark.asyncio
    async def test_story_falls_back_to_prompt_title_when_marker_missing(self, client):
        """When direct flow omits title marker, backend emits derived fallback title."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("The city did not know his name yet.")

        mock_store = MagicMock()
        mock_store.create_session.return_value = "sess-title-2"

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "auth-user-2"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.SessionQueryService.update_session_title", return_value=True) as mock_update_title:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "write a story about mosquito man in neo veridia"},
            )

        events = await self._sse_lines(response)
        assert events[0]["type"] == "session"
        assert events[1]["type"] == "title"
        assert events[1]["title"]  # non-empty fallback
        assert events[2]["type"] == "text"
        assert events[2]["chunk"] == "The city did not know his name yet."
        mock_update_title.assert_called_once()

    @pytest.mark.asyncio
    async def test_companion_flow_uses_companion_title_and_does_not_parse_marker(self, client):
        """Companion flow emits proposal title and leaves story text untouched."""
        async def mock_run_async(**kwargs):
            # In companion mode this must stay as prose; no marker parsing.
            yield _make_text_event("[[TITLE: Should Not Be Parsed]]\nCompanion-guided prose.")

        mock_companion_store = MagicMock()
        mock_companion_store.resume_session.return_value = True
        mock_companion_store.get_companion_data.return_value = (
            "Companion context",
            "Echoes Of Yesterday",
            "A tale shaped by memory",
        )

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "user-1"})), \
             patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.SessionStore", return_value=mock_companion_store), \
             patch("app.server.routes.SessionQueryService.update_session_title", return_value=True) as mock_update_title:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "tell me a story", "companion_session_id": "companion-123"},
            )

        events = await self._sse_lines(response)
        title_events = [e for e in events if e.get("type") == "title"]
        text_events = [e for e in events if e.get("type") == "text"]

        assert len(title_events) == 1
        assert title_events[0]["title"] == "Echoes Of Yesterday"
        assert len(text_events) == 1
        assert text_events[0]["chunk"].startswith("[[TITLE: Should Not Be Parsed]]")
        mock_update_title.assert_called_once()

    @pytest.mark.asyncio
    async def test_story_auth_uses_header_user_id_as_canonical(self, client):
        """Authenticated request uses token uid instead of body user_id."""
        captured = {}

        async def mock_run_async(user_id, session_id, new_message):
            captured["user_id"] = user_id
            captured["session_id"] = session_id
            yield _make_text_event("Hi")

        mock_store = MagicMock()
        mock_store.create_session.return_value = "store-sess-1"

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "auth-user-123"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "Test", "user_id": "body-user", "session_id": None},
            )

        assert captured["user_id"] == "auth-user-123"
        assert captured["session_id"] == "store-sess-1"
        mock_store.create_session.assert_called_once_with("Untitled Story")

    @pytest.mark.asyncio
    async def test_story_auth_creates_session_when_missing_session_id(self, client):
        """Authenticated request with no session_id creates SessionStore session."""
        captured = {}

        async def mock_run_async(user_id, session_id, new_message):
            captured["user_id"] = user_id
            captured["session_id"] = session_id
            yield _make_text_event("Hi")

        mock_store = MagicMock()
        mock_store.create_session.return_value = "new-store-session"

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "auth-user-abc"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "Test"},
            )

        assert response.status_code == 200
        mock_store.create_session.assert_called_once_with("Untitled Story")
        assert captured["session_id"] == "new-store-session"

    @pytest.mark.asyncio
    async def test_story_auth_resumes_session_when_session_id_provided(self, client):
        """Authenticated request with session_id resumes SessionStore session."""
        captured = {}

        async def mock_run_async(user_id, session_id, new_message):
            captured["user_id"] = user_id
            captured["session_id"] = session_id
            yield _make_text_event("Hi")

        mock_store = MagicMock()
        mock_store.resume_session.return_value = True

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "auth-user-xyz"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "Test", "session_id": "sess-keep"},
            )

        assert response.status_code == 200
        mock_store.resume_session.assert_called_once_with("sess-keep")
        mock_store.create_session.assert_not_called()
        assert captured["session_id"] == "sess-keep"

    @pytest.mark.asyncio
    async def test_story_uses_provided_user_id(self, client):
        """Explicit user_id passed to runner.run_async."""
        captured = {}

        async def mock_run_async(user_id, session_id, new_message):
            captured["user_id"] = user_id
            captured["session_id"] = session_id
            yield _make_text_event("Hi")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            await client.post(
                "/api/v1/stories",
                json={"prompt": "Test", "user_id": "user-abc", "session_id": "sess-123"},
            )

        assert captured["user_id"] == "user-abc"
        assert captured["session_id"] == "sess-123"

    @pytest.mark.asyncio
    async def test_story_defaults_to_anonymous_user(self, client):
        """No user_id → defaults to 'anonymous'."""
        captured = {}

        async def mock_run_async(user_id, session_id, new_message):
            captured["user_id"] = user_id
            yield _make_text_event("Hi")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            await client.post("/api/v1/stories", json={"prompt": "Test"})

        assert captured["user_id"] == "anonymous"

    @pytest.mark.asyncio
    async def test_story_creates_session_when_not_existing(self, client):
        """No existing session → create_session is called."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("Hi")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            await client.post("/api/v1/stories", json={"prompt": "Test"})

        mock_runner.session_service.create_session.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_story_skips_create_when_session_exists(self, client):
        """Existing session → create_session is NOT called."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("Hi")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(
                return_value=MagicMock()  # existing session
            )
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            await client.post("/api/v1/stories", json={"prompt": "Test"})

        mock_runner.session_service.create_session.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_story_missing_prompt_returns_422(self, client):
        """Missing required 'prompt' field → 422 validation error."""
        response = await client.post("/api/v1/stories", json={})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_story_has_correct_sse_headers(self, client):
        """SSE response has correct Cache-Control and content-type headers."""
        async def mock_run_async(**kwargs):
            yield _make_text_event("Hi")

        with patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post("/api/v1/stories", json={"prompt": "Test"})

        assert "text/event-stream" in response.headers.get("content-type", "")
        assert response.headers.get("cache-control") == "no-cache"


# ── GET /api/images/{filename} ────────────────────────────────────────────────

class TestServeImage:
    @pytest.mark.asyncio
    async def test_serve_image_returns_404_when_not_found(self, client):
        """Non-existent image → 404."""
        response = await client.get("/api/images/nonexistent.png")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_serve_image_returns_file_when_exists(self, client, tmp_path):
        """Existing PNG → served with image/png content-type."""
        img_file = tmp_path / "test.png"
        img_file.write_bytes(b"\x89PNG\r\n\x1a\n")  # PNG magic bytes

        with patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path):
            response = await client.get("/api/images/test.png")

        assert response.status_code == 200
        assert "image/png" in response.headers["content-type"]


# ── GET /api/v1/assets/images/{session_id}/{filename} ───��────────────────────

class TestServeAssetImage:
    @pytest.mark.asyncio
    async def test_asset_image_serves_local_cache_first(self, client, tmp_path):
        """Local cache hit → serve directly without signed URL."""
        filename = "abcdef01234567890abcdef012345678.png"
        img_file = tmp_path / filename
        img_file.write_bytes(b"\x89PNG\r\n\x1a\n")

        session_id = "abcdef01234567890abcdef012345678"
        with patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path):
            response = await client.get(
                f"/api/v1/assets/images/{session_id}/{filename}",
                follow_redirects=False,
            )

        assert response.status_code == 200
        assert "image/png" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_asset_image_redirects_to_signed_url(self, client, tmp_path):
        """No local cache → 302 redirect to signed GCS URL."""
        session_id = "abcdef01234567890abcdef012345678"
        filename = "abcdef01234567890abcdef012345678.png"
        signed = "https://storage.googleapis.com/signed-url-here"

        with patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path), \
             patch("app.server.routes.generate_signed_url", return_value=signed):
            response = await client.get(
                f"/api/v1/assets/images/{session_id}/{filename}",
                follow_redirects=False,
            )

        assert response.status_code == 302
        assert response.headers["location"] == signed

    @pytest.mark.asyncio
    async def test_asset_image_rejects_invalid_session_id(self, client):
        """Non-hex session_id → 400."""
        session_id = "not-a-valid-hex-id!!"
        response = await client.get(f"/api/v1/assets/images/{session_id}/abcdef01234567890abcdef012345678.png")
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_asset_image_rejects_invalid_filename(self, client):
        """Invalid filename format → 400."""
        session_id = "abcdef01234567890abcdef012345678"
        response = await client.get(f"/api/v1/assets/images/{session_id}/not-valid-filename.exe")
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_asset_image_returns_404_on_signed_url_failure(self, client, tmp_path):
        """GCS signed URL generation failure → 404."""
        session_id = "abcdef01234567890abcdef012345678"
        filename = "abcdef01234567890abcdef012345678.png"

        with patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path), \
             patch("app.server.routes.generate_signed_url", side_effect=Exception("GCS error")):
            response = await client.get(
                f"/api/v1/assets/images/{session_id}/{filename}",
                follow_redirects=False,
            )

        assert response.status_code == 404
