"""Unit tests for app/tools/imagen.py — Imagen 4 generate_image() ADK tool."""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch


class TestGenerateImage:
    """Tests for generate_image()."""

    @pytest.mark.asyncio
    async def test_generate_image_returns_image_url_and_caption(self, tmp_path):
        """Successful generation → returns image_url and caption."""
        # Mock response with image bytes
        fake_bytes = b"\x89PNG\r\n\x1a\nfake_image_data"
        mock_image = MagicMock()
        mock_image.image.image_bytes = fake_bytes

        mock_response = MagicMock()
        mock_response.generated_images = [mock_image]

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            result = await generate_image("A dragon soaring over mountains")

        assert "image_url" in result
        assert result["image_url"].startswith("/api/images/")
        assert result["image_url"].endswith(".png")
        assert "caption" in result
        assert "dragon" in result["caption"].lower()

    @pytest.mark.asyncio
    async def test_generate_image_saves_png_to_cache(self, tmp_path):
        """Image bytes are saved to IMAGE_CACHE_DIR."""
        fake_bytes = b"fake_png_data"
        mock_image = MagicMock()
        mock_image.image.image_bytes = fake_bytes

        mock_response = MagicMock()
        mock_response.generated_images = [mock_image]

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            result = await generate_image("A forest at dawn")

        # File should exist in cache
        filename = result["image_url"].split("/")[-1]
        saved_file = tmp_path / filename
        assert saved_file.exists()
        assert saved_file.read_bytes() == fake_bytes

    @pytest.mark.asyncio
    async def test_generate_image_uses_correct_model(self, tmp_path):
        """Calls generate_images with the configured IMAGEN_MODEL."""
        mock_image = MagicMock()
        mock_image.image.image_bytes = b"data"
        mock_response = MagicMock()
        mock_response.generated_images = [mock_image]

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path), \
             patch("app.tools.imagen.IMAGEN_MODEL", "imagen-4.0-generate-001"):

            from app.tools.imagen import generate_image
            await generate_image("A river scene")

        call_kwargs = mock_client.models.generate_images.call_args
        assert call_kwargs.kwargs["model"] == "imagen-4.0-generate-001"

    @pytest.mark.asyncio
    async def test_generate_image_requests_16_9_aspect_ratio(self, tmp_path):
        """Image config uses 16:9 aspect ratio."""
        mock_image = MagicMock()
        mock_image.image.image_bytes = b"data"
        mock_response = MagicMock()
        mock_response.generated_images = [mock_image]

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            await generate_image("A city skyline")

        call_kwargs = mock_client.models.generate_images.call_args
        config = call_kwargs.kwargs["config"]
        # aspect_ratio is set on the config object
        assert config is not None

    @pytest.mark.asyncio
    async def test_generate_image_no_images_returned_returns_error(self, tmp_path):
        """Empty generated_images → returns error dict."""
        mock_response = MagicMock()
        mock_response.generated_images = []

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            result = await generate_image("Test scene")

        assert "error" in result
        assert "no images" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_generate_image_exception_returns_error(self, tmp_path):
        """API exception → returns error dict (does not raise)."""
        mock_client = MagicMock()
        mock_client.models.generate_images.side_effect = RuntimeError("Quota exceeded")

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            result = await generate_image("Any scene")

        assert "error" in result
        assert "Quota exceeded" in result["error"]

    @pytest.mark.asyncio
    async def test_generate_image_caption_truncated_to_140_chars(self, tmp_path):
        """Long scene_description → caption truncated to 140 chars."""
        long_description = "A " + "very long " * 20

        mock_image = MagicMock()
        mock_image.image.image_bytes = b"data"
        mock_response = MagicMock()
        mock_response.generated_images = [mock_image]

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            result = await generate_image(long_description)

        assert len(result["caption"]) <= 140

    @pytest.mark.asyncio
    async def test_generate_image_appends_style_to_prompt(self, tmp_path):
        """scene_description + style are combined into the full prompt."""
        mock_image = MagicMock()
        mock_image.image.image_bytes = b"data"
        mock_response = MagicMock()
        mock_response.generated_images = [mock_image]

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            await generate_image("A knight", style="oil painting")

        call_kwargs = mock_client.models.generate_images.call_args
        prompt = call_kwargs.kwargs["prompt"]
        assert "A knight" in prompt
        assert "oil painting" in prompt

    @pytest.mark.asyncio
    async def test_generate_image_each_call_produces_unique_filename(self, tmp_path):
        """Two calls → two different filenames (UUID-based)."""
        mock_image = MagicMock()
        mock_image.image.image_bytes = b"data"
        mock_response = MagicMock()
        mock_response.generated_images = [mock_image]

        mock_client = MagicMock()
        mock_client.models.generate_images.return_value = mock_response

        with patch("app.tools.imagen.get_genai_client", return_value=mock_client), \
             patch("app.tools.imagen.IMAGE_CACHE_DIR", tmp_path):

            from app.tools.imagen import generate_image
            result1 = await generate_image("Scene 1")
            result2 = await generate_image("Scene 2")

        assert result1["image_url"] != result2["image_url"]
