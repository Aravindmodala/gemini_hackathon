"""Unit tests for app/tools/lyria.py — Lyria 2 generate_music() ADK tool."""

import base64
import json
import pytest
from unittest.mock import MagicMock, patch
from io import BytesIO


class TestGenerateMusic:
    """Tests for the standalone generate_music() ADK tool function."""

    def _make_mock_http_response(self, predictions: list) -> MagicMock:
        """Build a mock urllib response that returns the given predictions."""
        body = json.dumps({"predictions": predictions}).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.read.return_value = body
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        return mock_resp

    @pytest.mark.asyncio
    async def test_generate_music_returns_audio_url(self, tmp_path):
        """Successful generation → returns audio_url and duration_seconds."""
        audio_bytes = b"RIFF" + b"\x00" * 100
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/wav"}
        ])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "mock-token"
            mock_auth.return_value = (mock_creds, "project")

            from app.tools.lyria import generate_music
            result = await generate_music("Epic orchestral fantasy")

        assert "audio_url" in result
        assert result["audio_url"].startswith("/api/music/")
        assert "duration_seconds" in result
        assert result["duration_seconds"] == 33

    @pytest.mark.asyncio
    async def test_generate_music_saves_wav_to_cache(self, tmp_path):
        """Generated audio is saved to MUSIC_CACHE_DIR."""
        audio_bytes = b"RIFF" + b"\x00" * 50
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/wav"}
        ])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            result = await generate_music("Gentle acoustic")

        filename = result["audio_url"].split("/")[-1]
        saved = tmp_path / filename
        assert saved.exists()
        assert saved.read_bytes() == audio_bytes

    @pytest.mark.asyncio
    async def test_generate_music_wav_extension_for_wav_mimetype(self, tmp_path):
        """audio/wav MIME type → .wav extension."""
        audio_b64 = base64.b64encode(b"data").decode("utf-8")
        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/wav"}
        ])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            result = await generate_music("Test")

        assert result["audio_url"].endswith(".wav")

    @pytest.mark.asyncio
    async def test_generate_music_mp3_extension_for_mpeg_mimetype(self, tmp_path):
        """audio/mpeg MIME type → .mp3 extension."""
        audio_b64 = base64.b64encode(b"data").decode("utf-8")
        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/mpeg"}
        ])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            result = await generate_music("Test")

        assert result["audio_url"].endswith(".mp3")

    @pytest.mark.asyncio
    async def test_generate_music_fallback_audioContent_key(self, tmp_path):
        """audioContent key (fallback) is also accepted."""
        audio_b64 = base64.b64encode(b"content").decode("utf-8")
        mock_resp = self._make_mock_http_response([
            {"audioContent": audio_b64, "mimeType": "audio/wav"}
        ])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            result = await generate_music("Test")

        assert "audio_url" in result

    @pytest.mark.asyncio
    async def test_generate_music_no_predictions_returns_error(self, tmp_path):
        """Empty predictions list → returns error dict."""
        mock_resp = self._make_mock_http_response([])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            result = await generate_music("Test")

        assert "error" in result
        assert "No music generated" in result["error"]

    @pytest.mark.asyncio
    async def test_generate_music_exception_returns_error(self, tmp_path):
        """Network exception → returns error dict (does not raise)."""
        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", side_effect=OSError("Connection refused")), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            result = await generate_music("Test")

        assert "error" in result
        assert "Connection refused" in result["error"]

    @pytest.mark.asyncio
    async def test_generate_music_includes_negative_prompt_when_provided(self, tmp_path):
        """negative_prompt is included in the request payload."""
        audio_b64 = base64.b64encode(b"data").decode("utf-8")
        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/wav"}
        ])

        captured_request = {}

        def mock_urlopen(req, timeout=None):
            captured_request["body"] = json.loads(req.data.decode("utf-8"))
            return mock_resp

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            await generate_music("Epic", negative_prompt="drums, vocals")

        instance = captured_request["body"]["instances"][0]
        assert instance.get("negative_prompt") == "drums, vocals"

    @pytest.mark.asyncio
    async def test_generate_music_omits_negative_prompt_when_empty(self, tmp_path):
        """Empty negative_prompt is not sent in the payload."""
        audio_b64 = base64.b64encode(b"data").decode("utf-8")
        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/wav"}
        ])

        captured_request = {}

        def mock_urlopen(req, timeout=None):
            captured_request["body"] = json.loads(req.data.decode("utf-8"))
            return mock_resp

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            await generate_music("Epic")

        instance = captured_request["body"]["instances"][0]
        assert "negative_prompt" not in instance

    @pytest.mark.asyncio
    async def test_generate_music_unique_filename_per_call(self, tmp_path):
        """Two calls produce different filenames."""
        audio_b64 = base64.b64encode(b"data").decode("utf-8")
        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/wav"}
        ])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            r1 = await generate_music("Scene 1")
            r2 = await generate_music("Scene 2")

        assert r1["audio_url"] != r2["audio_url"]

    @pytest.mark.asyncio
    async def test_generate_music_includes_description_in_result(self, tmp_path):
        """Result includes the prompt as 'description'."""
        audio_b64 = base64.b64encode(b"data").decode("utf-8")
        mock_resp = self._make_mock_http_response([
            {"bytesBase64Encoded": audio_b64, "mimeType": "audio/wav"}
        ])

        with patch("app.tools.lyria.MUSIC_CACHE_DIR", tmp_path), \
             patch("urllib.request.urlopen", return_value=mock_resp), \
             patch("google.auth.default") as mock_auth:
            mock_creds = MagicMock()
            mock_creds.token = "tok"
            mock_auth.return_value = (mock_creds, "proj")

            from app.tools.lyria import generate_music
            result = await generate_music("Haunting lute melody")

        assert result["description"] == "Haunting lute melody"


class TestLyriaTool:
    """Tests for the legacy LyriaTool class (still present in module)."""

    def test_lyria_tool_name_is_generate_music(self):
        """LyriaTool.name == 'generate_music'."""
        from app.tools.lyria import LyriaTool
        tool = LyriaTool()
        assert tool.name == "generate_music"

    def test_lyria_tool_declaration_has_function_declarations(self):
        """LyriaTool.declaration has 'functionDeclarations' key."""
        from app.tools.lyria import LyriaTool
        tool = LyriaTool()
        decl = tool.declaration
        assert "functionDeclarations" in decl
        assert len(decl["functionDeclarations"]) == 1

    def test_lyria_tool_declaration_has_required_parameters(self):
        """LyriaTool declaration requires 'currently_narrating_story' and 'prompt'."""
        from app.tools.lyria import LyriaTool
        tool = LyriaTool()
        fn_decl = tool.declaration["functionDeclarations"][0]
        assert "currently_narrating_story" in fn_decl["parameters"]["required"]
        assert "prompt" in fn_decl["parameters"]["required"]
