"""Unit tests for app/core/visual_engine.py."""

import asyncio
import base64
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.config import VISUAL_MODEL
from app.core.visual_engine import generate_image


def _make_response_with_inline_data(data, mime_type: str):
    part = SimpleNamespace(inline_data=SimpleNamespace(data=data, mime_type=mime_type))
    candidate = SimpleNamespace(content=SimpleNamespace(parts=[part]))
    return SimpleNamespace(candidates=[candidate])


@pytest.mark.asyncio
async def test_generate_image_returns_image_bytes_and_mime():
    response = _make_response_with_inline_data(b"\x89PNG", "image/png")
    client = SimpleNamespace(models=SimpleNamespace(generate_content=MagicMock(return_value=response)))

    with patch("app.core.visual_engine.get_genai_client", return_value=client):
        result = await generate_image("cinematic mountain valley")

    assert result == (b"\x89PNG", "image/png")
    client.models.generate_content.assert_called_once()
    kwargs = client.models.generate_content.call_args.kwargs
    assert kwargs["model"] == VISUAL_MODEL
    assert "cinematic mountain valley" in kwargs["contents"]


@pytest.mark.asyncio
async def test_generate_image_decodes_base64_payload():
    raw = b"jpeg-bytes"
    b64 = base64.b64encode(raw).decode("ascii")
    response = _make_response_with_inline_data(b64, "image/jpeg")
    client = SimpleNamespace(models=SimpleNamespace(generate_content=MagicMock(return_value=response)))

    with patch("app.core.visual_engine.get_genai_client", return_value=client):
        result = await generate_image("portrait shot")

    assert result == (raw, "image/jpeg")


@pytest.mark.asyncio
async def test_generate_image_returns_none_on_missing_candidates():
    response = SimpleNamespace(candidates=[])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=MagicMock(return_value=response)))

    with patch("app.core.visual_engine.get_genai_client", return_value=client):
        result = await generate_image("anything")

    assert result is None


@pytest.mark.asyncio
async def test_generate_image_returns_none_on_timeout():
    with patch("app.core.visual_engine.get_genai_client", return_value=MagicMock()), \
         patch("app.core.visual_engine.asyncio.wait_for", side_effect=asyncio.TimeoutError):
        result = await generate_image("slow image")

    assert result is None


@pytest.mark.asyncio
async def test_generate_image_returns_none_when_part_has_no_inline_data():
    part = SimpleNamespace(inline_data=None)
    response = SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=MagicMock(return_value=response)))

    with patch("app.core.visual_engine.get_genai_client", return_value=client):
        result = await generate_image("no inline data")

    assert result is None


@pytest.mark.asyncio
async def test_generate_image_returns_none_for_non_image_mime_type():
    part = SimpleNamespace(
        inline_data=SimpleNamespace(data=b"text-only", mime_type="text/plain"),
    )
    response = SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=MagicMock(return_value=response)))

    with patch("app.core.visual_engine.get_genai_client", return_value=client):
        result = await generate_image("non image mime")

    assert result is None
