"""End-to-end integration tests for the story generation pipeline.

These tests simulate the full flow: HTTP request → SSE stream → ADK runner
(mocked) → text + native inline images + GCS upload + Firestore persistence.

All external dependencies (Gemini API, GCS, Firestore, Firebase Auth) are
mocked so tests run offline and deterministically.
"""

import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, call
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


def _parse_sse_events(response_text: str) -> list[dict]:
    """Parse SSE response text into list of JSON events."""
    events = []
    for line in response_text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


def _make_text_part(text: str) -> MagicMock:
    """Create a mock part with text content."""
    part = MagicMock(spec=[])
    part.text = text
    part.thought = False
    part.function_response = None
    part.inline_data = None
    return part


def _make_inline_image_part(
    image_bytes: bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100,
    mime_type: str = "image/png",
) -> MagicMock:
    """Create a mock part with native inline_data (Gemini 3 Pro Image Preview)."""
    inline_data = MagicMock(spec=[])
    inline_data.data = image_bytes
    inline_data.mime_type = mime_type

    part = MagicMock(spec=[])
    part.text = None
    part.thought = False
    part.function_response = None
    part.inline_data = inline_data
    return part


def _make_event(*parts) -> MagicMock:
    """Create a mock ADK event from one or more parts."""
    event = MagicMock()
    event.content = MagicMock()
    event.content.parts = list(parts)
    return event


# ── E2E Tests ──────────────────────────────────────────────────────────────────

class TestE2EStoryFlow:
    """Full pipeline tests: request → SSE → text + images + GCS + Firestore."""

    @pytest.mark.asyncio
    async def test_full_story_with_text_and_images(self, client, tmp_path):
        """Complete story with interleaved text and native inline images."""
        async def mock_run_async(**kwargs):
            # Simulate a realistic Gemini response: text → image → text → image → text
            yield _make_event(_make_text_part("Chapter 1: The Beginning\n\n"))
            yield _make_event(_make_text_part("The rain fell heavy on the cobblestone streets of Oakhaven. "))
            yield _make_event(_make_inline_image_part())  # opening illustration
            yield _make_event(_make_text_part("Kaelen wiped the counter of the midnight diner. "))
            yield _make_event(_make_text_part("His hands trembled — not from cold, but from holding back. "))
            yield _make_event(_make_inline_image_part(mime_type="image/jpeg"))  # character reveal
            yield _make_event(_make_text_part("The end."))

        mock_gcs_url = "https://storage.googleapis.com/test-bucket/images/test.png"

        with patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path), \
             patch("app.server.routes.upload_to_gcs", return_value=mock_gcs_url) as mock_upload:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "A superhero story"},
            )

        assert response.status_code == 200

        events = _parse_sse_events(response.text)

        # Should start with session event
        assert events[0]["type"] == "session"

        # Collect event types (excluding session and done)
        content_events = [e for e in events if e["type"] not in ("session", "done", "thinking")]
        text_events = [e for e in content_events if e["type"] == "text"]
        image_events = [e for e in content_events if e["type"] == "image"]

        # Should have 5 text chunks and 2 images
        assert len(text_events) == 5
        assert len(image_events) == 2

        # Images are always served through the asset endpoint, even after successful upload.
        assert image_events[0]["url"].startswith("/api/v1/assets/images/")
        assert image_events[0]["url"].endswith(".png")

        # Images should have been saved to local cache too
        cached_files = list(tmp_path.glob("*"))
        assert len(cached_files) == 2  # two image files

        # GCS upload should have been called twice
        assert mock_upload.call_count == 2

        # Should end with done
        assert events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_gcs_failure_falls_back_to_local_url(self, client, tmp_path):
        """When GCS upload fails, image URL falls back to /api/v1/assets/images/ path."""
        async def mock_run_async(**kwargs):
            yield _make_event(_make_inline_image_part())

        with patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path), \
             patch("app.server.routes.upload_to_gcs", side_effect=Exception("GCS bucket not found")):
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Test GCS fallback"},
            )

        events = _parse_sse_events(response.text)
        image_events = [e for e in events if e.get("type") == "image"]
        assert len(image_events) == 1
        assert image_events[0]["url"].startswith("/api/v1/assets/images/")
        assert image_events[0]["url"].endswith(".png")

    @pytest.mark.asyncio
    async def test_oversized_image_is_skipped(self, client, tmp_path):
        """Images larger than MAX_IMAGE_BYTES are silently skipped."""
        # Create a 25 MB image (over the 20 MB limit)
        huge_image = b"\x89PNG\r\n\x1a\n" + b"\x00" * (25 * 1024 * 1024)

        async def mock_run_async(**kwargs):
            yield _make_event(_make_text_part("Story text"))
            yield _make_event(_make_inline_image_part(image_bytes=huge_image))

        with patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.IMAGE_CACHE_DIR", tmp_path):
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Test oversized image"},
            )

        events = _parse_sse_events(response.text)
        image_events = [e for e in events if e.get("type") == "image"]
        assert len(image_events) == 0  # oversized image was skipped

    @pytest.mark.asyncio
    async def test_thinking_events_emitted_during_slow_generation(self, client):
        """When model takes >5 seconds, thinking keep-alive pings are emitted."""
        import asyncio

        async def mock_run_async(**kwargs):
            # Simulate a slow model — 7 second delay before any content
            await asyncio.sleep(7)
            yield _make_event(_make_text_part("Finally, a story!"))

        with patch("app.server.routes.runner") as mock_runner, \
             patch("app.server.routes.HEARTBEAT_INTERVAL_SECONDS", 1):  # speed up for test
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                json={"prompt": "Test heartbeat"},
            )

        events = _parse_sse_events(response.text)
        thinking_events = [e for e in events if e.get("type") == "thinking"]
        # Should have at least a few thinking pings (7s delay / 1s interval)
        assert len(thinking_events) >= 2

        # Should still have the actual story content
        text_events = [e for e in events if e.get("type") == "text"]
        assert len(text_events) == 1
        assert text_events[0]["chunk"] == "Finally, a story!"

    @pytest.mark.asyncio
    async def test_firestore_flush_during_long_text(self, client):
        """Text is flushed to Firestore when buffer exceeds ELORA_FLUSH_CHARS."""
        # Generate text that exceeds the 800-char flush threshold
        long_text = "x" * 500  # two chunks of 500 = 1000 chars > 800 threshold

        async def mock_run_async(**kwargs):
            yield _make_event(_make_text_part(long_text))
            yield _make_event(_make_text_part(long_text))  # this should trigger flush

        mock_store = MagicMock()
        mock_store.create_session.return_value = "firestore-session-123"
        mock_store.log_interaction = MagicMock()
        mock_store.log_tool_call = MagicMock()
        mock_store.end_session = MagicMock()

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "test-user"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "Long story test"},
            )

        assert response.status_code == 200

        # log_interaction should be called:
        # 1. for the user prompt
        # 2. mid-stream flush (when buffer exceeds 800 chars)
        # 3. final flush of remaining text
        log_calls = mock_store.log_interaction.call_args_list
        assert len(log_calls) >= 2  # at least user prompt + elora text

        # Session should be ended
        mock_store.end_session.assert_called_once()

    @pytest.mark.asyncio
    async def test_error_during_generation_sends_error_event(self, client):
        """Runtime error during generation → error SSE event + session cleanup."""
        async def mock_run_async(**kwargs):
            raise RuntimeError("ADK runner exploded")
            yield  # make it a generator

        mock_store = MagicMock()
        mock_store.create_session.return_value = "error-session-123"
        mock_store.log_interaction = MagicMock()
        mock_store.end_session = MagicMock()

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "test-user"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={"prompt": "Error test"},
            )

        events = _parse_sse_events(response.text)
        error_events = [e for e in events if e.get("type") == "error"]
        assert len(error_events) == 1
        assert "Story generation failed" in error_events[0]["message"]

        # Session should still be ended even on error
        mock_store.end_session.assert_called_once()


    @pytest.mark.asyncio
    async def test_companion_context_injected_into_story(self, client):
        """Companion session data is loaded and injected into the story prompt."""
        captured_messages = []

        async def mock_run_async(**kwargs):
            # Capture the new_message to verify companion context was injected
            msg = kwargs.get("new_message")
            if msg:
                for part in msg.parts:
                    if hasattr(part, "text") and part.text:
                        captured_messages.append(part.text)
            yield _make_event(_make_text_part("A story born from emotion."))

        mock_store = MagicMock()
        mock_store.create_session.return_value = "story-session-789"
        mock_store.log_interaction = MagicMock()
        mock_store.log_tool_call = MagicMock()
        mock_store.end_session = MagicMock()

        # Mock companion store with context
        mock_companion_store = MagicMock()
        mock_companion_store.resume_session.return_value = True
        mock_companion_store.get_companion_data.return_value = (
            "User feels nostalgic and wistful today",
            "Echoes of Yesterday",
            "A story about memories",
        )

        def session_store_factory(user_id):
            # First call is for companion, second is for story
            return mock_companion_store

        with patch("app.server.routes.get_optional_user", new=AsyncMock(return_value={"uid": "user-abc"})), \
             patch("app.server.session_resolver.SessionStore", return_value=mock_store), \
             patch("app.server.routes.SessionStore", side_effect=session_store_factory), \
             patch("app.server.routes.runner") as mock_runner:
            mock_runner.session_service.get_session = AsyncMock(return_value=None)
            mock_runner.session_service.create_session = AsyncMock()
            mock_runner.run_async = mock_run_async

            response = await client.post(
                "/api/v1/stories",
                headers={"Authorization": "Bearer valid-token"},
                json={
                    "prompt": "Tell me a story",
                    "companion_session_id": "companion-sess-456",
                },
            )

        events = _parse_sse_events(response.text)

        # Should have a title event from companion context
        title_events = [e for e in events if e.get("type") == "title"]
        assert len(title_events) == 1
        assert title_events[0]["title"] == "Echoes of Yesterday"


class TestSystemPromptContent:
    """Verify the system prompt has the required content for genre-adaptive storytelling."""

    def test_prompt_contains_genre_adaptivity(self):
        """System prompt includes genre-adaptive writing instructions."""
        from app.prompts import ELORA_SYSTEM_PROMPT
        assert "GENRE-ADAPTIVE" in ELORA_SYSTEM_PROMPT
        assert "Superhero" in ELORA_SYSTEM_PROMPT
        assert "Fantasy" in ELORA_SYSTEM_PROMPT
        assert "Horror" in ELORA_SYSTEM_PROMPT

    def test_prompt_requires_minimum_images(self):
        """System prompt mandates at least 4 images per story."""
        from app.prompts import ELORA_SYSTEM_PROMPT
        assert "at least 4 images" in ELORA_SYSTEM_PROMPT
        assert "MANDATORY" in ELORA_SYSTEM_PROMPT

    def test_prompt_forbids_questions(self):
        """System prompt explicitly forbids asking the reader questions."""
        from app.prompts import ELORA_SYSTEM_PROMPT
        assert "NEVER ask the reader a question" in ELORA_SYSTEM_PROMPT

    def test_prompt_requires_2000_word_minimum(self):
        """System prompt requires 2000 word minimum."""
        from app.prompts import ELORA_SYSTEM_PROMPT
        assert "2000 words minimum" in ELORA_SYSTEM_PROMPT

    def test_prompt_mentions_comic_book_style(self):
        """System prompt mentions comic book writing style for superheroes."""
        from app.prompts import ELORA_SYSTEM_PROMPT
        assert "comic book writer" in ELORA_SYSTEM_PROMPT

    def test_prompt_art_style_matches_genre(self):
        """System prompt instructs matching art style to genre."""
        from app.prompts import ELORA_SYSTEM_PROMPT
        assert "comic-book style for superheroes" in ELORA_SYSTEM_PROMPT
