"""
Lyria — AI music generation tool for storytelling.

Generates instrumental music tracks from text prompts using
Google's Lyria 2 model on Vertex AI.

API Reference:
  https://cloud.google.com/vertex-ai/generative-ai/docs/music/generate-music
"""

import json
import logging

import google.auth
import google.auth.transport.requests

from app.config import PROJECT_ID, LOCATION
from app.tools.base import BaseTool

logger = logging.getLogger("chronicler")

# Lyria model ID
LYRIA_MODEL = "lyria-002"


class LyriaTool(BaseTool):
    """
    Generate instrumental music for story scenes using Lyria 2.

    When ELORA describes a dramatic scene, she can call this tool
    to generate background music that matches the mood — epic
    orchestral for battles, gentle acoustic for tender moments, etc.
    """

    @property
    def name(self) -> str:
        return "generate_music"

    @property
    def declaration(self) -> dict:
        return {
            "functionDeclarations": [
                {
                    "name": "generate_music",
                    "description": (
                        "Generate a ~30-second instrumental music track that fits "
                        "the current story scene. Use descriptive musical terms "
                        "like genre, mood, instruments, tempo, and style."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "prompt": {
                                "type": "string",
                                "description": (
                                    "A detailed description of the music to generate. "
                                    "Example: 'A haunting medieval lute melody with "
                                    "soft strings and a slow, contemplative tempo'"
                                ),
                            },
                            "negative_prompt": {
                                "type": "string",
                                "description": (
                                    "Optional: elements to exclude from the music. "
                                    "Example: 'drums, vocals, electronic sounds'"
                                ),
                            },
                        },
                        "required": ["prompt"],
                    },
                }
            ]
        }

    async def execute(self, *, prompt: str, negative_prompt: str = "", **kwargs) -> dict:
        """
        Call the Lyria 2 predict endpoint on Vertex AI.

        Returns:
            dict with audio_content (base64 WAV), mime_type, and duration.
        """
        try:
            logger.info(f"[Lyria] Generating music: '{prompt}'")

            # Get fresh access token
            credentials, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            auth_request = google.auth.transport.requests.Request()
            credentials.refresh(auth_request)

            # Build the predict request
            url = (
                f"https://{LOCATION}-aiplatform.googleapis.com/v1/"
                f"projects/{PROJECT_ID}/locations/{LOCATION}/"
                f"publishers/google/models/{LYRIA_MODEL}:predict"
            )

            instance = {"prompt": prompt}
            if negative_prompt:
                instance["negative_prompt"] = negative_prompt

            payload = {
                "instances": [instance],
                "parameters": {},
            }

            # Make the HTTP request using urllib (no extra dependency)
            import urllib.request

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {credentials.token}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))

            predictions = result.get("predictions", [])
            if not predictions:
                logger.warning("[Lyria] No predictions returned")
                return {"error": "No music generated"}

            audio_data = predictions[0].get("audioContent", "")
            mime_type = predictions[0].get("mimeType", "audio/wav")

            logger.info(f"[Lyria] ✅ Music generated ({len(audio_data)} bytes base64)")

            return {
                "audio_content": audio_data,
                "mime_type": mime_type,
                "duration_seconds": 33,
                "description": prompt,
            }

        except Exception as e:
            logger.error(f"[Lyria] ❌ Music generation failed: {e}")
            return {"error": str(e)}
