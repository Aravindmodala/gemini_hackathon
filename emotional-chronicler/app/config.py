"""
Configuration for The Emotional Chronicler.

Reads environment variables for GCP project, location, and model settings.
The ADK agent picks up GCP credentials via Application Default Credentials (ADC).
"""

import datetime
import os
from pathlib import Path

from google.cloud import storage as gcs

# Environment must be loaded by the entry point (main.py) before importing this module.

# ── Paths ────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / ".." / "frontend-react" / "dist"
IMAGE_CACHE_DIR = BASE_DIR / "_image_cache"
MUSIC_CACHE_DIR = BASE_DIR / "_music_cache"

IMAGE_CACHE_DIR.mkdir(exist_ok=True)
MUSIC_CACHE_DIR.mkdir(exist_ok=True)

# ── Google Cloud ─────────────────────────────────────────────
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

# ── ADK requires these env vars to route to Vertex AI ────────
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", PROJECT_ID)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", LOCATION)
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")

# ── Models ───────────────────────────────────────────────────
# ── Power Couple: two-model pipeline ────────────────────────
NARRATIVE_MODEL = os.environ.get("NARRATIVE_MODEL", "gemini-3.1-flash-lite-preview")
VISUAL_MODEL = os.environ.get("VISUAL_MODEL", "gemini-3-pro-image-preview")
VISUAL_TIMEOUT_SECONDS = float(os.environ.get("VISUAL_TIMEOUT_SECONDS", "75"))
STORY_MODEL = NARRATIVE_MODEL  # alias for backward compat
COMPANION_MODEL = os.environ.get("COMPANION_MODEL", "gemini-2.0-flash")  # Pre-story companion

# ── Firebase Authentication ───────────────────────────────────
FIREBASE_ENABLED = os.environ.get("FIREBASE_ENABLED", "true").lower() in ("true", "1", "yes")

# ── Server ───────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 3000))

# ── Google Cloud Storage (persistent asset storage) ──────────
GCS_BUCKET = os.environ.get("GCS_BUCKET", "emotional-chronicler-assets")

_gcs_client: gcs.Client | None = None

def get_gcs_bucket() -> gcs.Bucket:
    """Lazy-initialize GCS client and return the assets bucket."""
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = gcs.Client(project=PROJECT_ID)
    return _gcs_client.bucket(GCS_BUCKET)


def upload_to_gcs(blob_path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to GCS and return the blob path.

    Args:
        blob_path: Path within the bucket (e.g. 'images/{session_id}/abc123.png').
        data: Raw bytes to upload.
        content_type: MIME type (e.g. 'image/png', 'audio/wav').

    Returns:
        The blob path string (same as input), used to generate signed URLs on demand.
    """
    bucket = get_gcs_bucket()
    blob = bucket.blob(blob_path)
    blob.upload_from_string(data, content_type=content_type)
    return blob_path


def generate_signed_url(blob_path: str, expiration_minutes: int = 15) -> str:
    """Generate a short-lived signed URL for a GCS object.

    Args:
        blob_path: Path within the bucket (e.g. 'images/{session_id}/abc123.png').
        expiration_minutes: How long the URL remains valid (default 15 min).

    Returns:
        A signed URL string that grants temporary read access.
    """
    bucket = get_gcs_bucket()
    blob = bucket.blob(blob_path)
    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=expiration_minutes),
        method="GET",
    )


# ── GenAI client (for Visual Engine direct calls) ───────────
from google import genai

_genai_client: genai.Client | None = None


def get_genai_client() -> genai.Client:
    """Lazy-initialize the GenAI client for direct model calls (e.g., visual engine)."""
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client(
            vertexai=True, project=PROJECT_ID, location=LOCATION
        )
    return _genai_client

