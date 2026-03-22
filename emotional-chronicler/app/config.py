"""
Configuration for The Emotional Chronicler.

Reads environment variables for GCP project, location, and model settings.
Initializes the Google GenAI client for Imagen 4 and Lyria 2 access.
The ADK agent picks up GCP credentials via Application Default Credentials (ADC).
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai

load_dotenv()

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
GEMINI_LIVE_MODEL = "gemini-live-2.5-flash-native-audio"   # legacy Live API route
STORY_MODEL = os.environ.get("STORY_MODEL", "gemini-3.1-pro-preview")  # ADK agent brain
IMAGEN_MODEL = os.environ.get("IMAGEN_MODEL", "imagen-4.0-generate-001")  # Imagen 4
LYRIA_MODEL = "lyria-002"  # Lyria 2 music generation

# ── Firebase Authentication ───────────────────────────────────
FIREBASE_ENABLED = os.environ.get("FIREBASE_ENABLED", "true").lower() in ("true", "1", "yes")

# ── Server ───────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 3000))

# ── GenAI SDK Client (singleton) — used by Imagen 4 and Lyria 2 tools ──
genai_client = genai.Client(
    vertexai=True,
    project=PROJECT_ID,
    location=LOCATION,
)
