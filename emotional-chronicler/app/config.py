"""
Configuration for The Emotional Chronicler.

Reads environment variables for GCP project, location, and model settings.
Initializes the Google GenAI client for Imagen 4 and Lyria 2 access.
The ADK agent picks up GCP credentials via Application Default Credentials (ADC).
"""

import os
from pathlib import Path

from google import genai
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
STORY_MODEL = os.environ.get("STORY_MODEL", "gemini-3.1-pro-preview")  # ADK agent brain
IMAGEN_MODEL = os.environ.get("IMAGEN_MODEL", "imagen-4.0-generate-001")  # Imagen 4
COMPANION_MODEL = os.environ.get("COMPANION_MODEL", "gemini-2.0-flash")  # Pre-story companion
LYRIA_MODEL = "lyria-002"  # Lyria 2 music generation

# ── Firebase Authentication ───────────────────────────────────
FIREBASE_ENABLED = os.environ.get("FIREBASE_ENABLED", "true").lower() in ("true", "1", "yes")

# ── Server ───────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 3000))

# ── GenAI SDK Client (singleton) — used by Imagen 4 and Lyria 2 tools ──
_genai_client: genai.Client | None = None

def get_genai_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)
    return _genai_client

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
    """Upload bytes to GCS and return the public URL.

    Args:
        blob_path: Path within the bucket (e.g. 'images/abc123.png').
        data: Raw bytes to upload.
        content_type: MIME type (e.g. 'image/png', 'audio/wav').

    Returns:
        Public URL string for the uploaded object.
    """
    bucket = get_gcs_bucket()
    blob = bucket.blob(blob_path)
    blob.upload_from_string(data, content_type=content_type)
    blob.make_public()
    return blob.public_url

