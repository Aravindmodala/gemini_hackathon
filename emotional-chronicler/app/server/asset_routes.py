"""Asset serving endpoints for generated story images.

Extracted from ``routes.py`` to keep binary/redirect responses separate
from the story streaming API.
"""

import asyncio
import logging
import mimetypes
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.config import IMAGE_CACHE_DIR, generate_signed_url, get_gcs_bucket

logger = logging.getLogger("chronicler")

_HEX_RE = re.compile(r"^[0-9a-f]{32}$")
_FILENAME_RE = re.compile(r"^[0-9a-f]{32}\.\w{2,4}$")

legacy_asset_router = APIRouter()
asset_router = APIRouter()


@legacy_asset_router.get(
    "/api/images/{filename}",
    summary="Serve a generated image",
    tags=["assets"],
    responses={
        200: {"description": "PNG image file"},
        404: {"description": "Image not found"},
    },
)
async def serve_image(filename: str):
    """Serve a generated illustration from local cache (legacy fallback)."""
    path = (IMAGE_CACHE_DIR / filename).resolve()
    if not path.is_relative_to(IMAGE_CACHE_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    media_type, _ = mimetypes.guess_type(str(path))
    return FileResponse(str(path), media_type=media_type or "application/octet-stream")


@asset_router.get(
    "/assets/images/{session_id}/{filename}",
    summary="Serve a story image via signed URL redirect",
    tags=["assets"],
    responses={
        302: {"description": "Redirect to a short-lived signed GCS URL"},
        200: {"description": "Image served from local cache (fallback)"},
        400: {"description": "Invalid path parameters"},
        404: {"description": "Image not found"},
    },
)
async def serve_asset_image(session_id: str, filename: str):
    """Serve a story image: local cache first, GCS signed URL redirect as fallback."""
    if not _HEX_RE.match(session_id) or not _FILENAME_RE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid path parameters")

    local_path = (IMAGE_CACHE_DIR / filename).resolve()
    if local_path.is_relative_to(IMAGE_CACHE_DIR.resolve()) and local_path.exists():
        media_type, _ = mimetypes.guess_type(str(local_path))
        return FileResponse(str(local_path), media_type=media_type or "application/octet-stream")

    blob_path = f"images/{session_id}/{filename}"
    try:
        signed_url = await asyncio.to_thread(generate_signed_url, blob_path)
        return RedirectResponse(url=signed_url, status_code=302)
    except Exception as e:
        logger.warning("[Asset] Failed to generate signed URL for %s: %s", blob_path, e)

    try:
        bucket = await asyncio.to_thread(get_gcs_bucket)
        blob = bucket.blob(blob_path)
        exists = await asyncio.to_thread(blob.exists)
        if not exists:
            raise HTTPException(status_code=404, detail="Image not found")

        data = await asyncio.to_thread(blob.download_as_bytes)
        media_type = blob.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        return Response(content=data, media_type=media_type)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[Asset] Failed direct GCS fetch for %s: %s", blob_path, e)
        raise HTTPException(status_code=404, detail="Image not found") from e
