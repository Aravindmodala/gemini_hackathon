"""
Configuration for The Emotional Chronicler.

Reads environment variables for GCP project, location, and model settings.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

# ── Paths ────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / ".." / "frontend-react" / "dist"

# ── Google Cloud ─────────────────────────────────────────────
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

# ── Models ───────────────────────────────────────────────────
GEMINI_LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

# ── Server ───────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 3000))


# ── Vertex AI WebSocket endpoint ─────────────────────────────
def get_gemini_ws_url() -> str:
    """Build the Vertex AI WebSocket URL for Gemini Live."""
    host = f"{LOCATION}-aiplatform.googleapis.com"
    ws_path = "ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
    return f"wss://{host}/{ws_path}"


def get_model_resource_name() -> str:
    """Full resource name for the model."""
    return f"projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{GEMINI_LIVE_MODEL}"
