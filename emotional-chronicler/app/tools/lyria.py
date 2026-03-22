"""
Lyria — AI music generation tool for storytelling.

Generates instrumental music tracks from text prompts using
Google's Lyria 2 model on Vertex AI.

API Reference:
  https://cloud.google.com/vertex-ai/generative-ai/docs/music/generate-music
"""

import json
import logging
import uuid

import google.auth
import google.auth.transport.requests

from app.config import PROJECT_ID, LOCATION, MUSIC_CACHE_DIR
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
                        "Generate a ~30-second instrumental background music track. "
                        "PREREQUISITE — only callable when ALL of these are true: "
                        "(1) you are currently mid-narration of a story (not discussing one, not about to start one — actively telling it right now), "
                        "(2) a significant scene transition, setting change, or tonal shift is occurring WITHIN that narration. "
                        "NEVER call this tool if any of the following are true: "
                        "you are in casual conversation; the user is speaking or has just spoken; "
                        "the user expressed happiness, sadness, excitement, or any other emotion; "
                        "you are greeting the user; you are discussing what kind of story to tell; "
                        "the story has not yet begun; the story just ended. "
                        "When in doubt, do NOT call it. "
                        "Prompt format: descriptive musical terms — genre, mood, instruments, tempo, style."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "currently_narrating_story": {
                                "type": "boolean",
                                "description": (
                                    "Confirmation gate — you MUST set this to true, "
                                    "and you may ONLY set it to true if you are "
                                    "right now, in this very response, actively "
                                    "narrating a story mid-sentence. "
                                    "If you are in conversation mode, answering a "
                                    "question, reacting to user emotion, giving advice, "
                                    "or doing ANYTHING other than narrating fiction — "
                                    "you cannot set this to true. Do not call this "
                                    "tool at all in that case."
                                ),
                            },
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
                        "required": ["currently_narrating_story", "prompt"],
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

            audio_data = (
                predictions[0].get("bytesBase64Encoded")
                or predictions[0].get("audioContent", "")
            )
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


# ── ADK-compatible standalone tool function ───────────────────────────────────

async def generate_music(
    prompt: str,
    negative_prompt: str = "",
) -> dict:
    """Generate instrumental background music for the current story scene.

    Call this at significant scene transitions or tonal shifts during narration:
    the opening of a new chapter, a mood change from tense to peaceful, the climax
    of a battle, or any moment where the emotional atmosphere shifts dramatically.
    Do NOT call this during conversation or before the story has begun.

    Args:
        prompt: Descriptive music prompt — genre, mood, instruments, tempo, and style.
            Example: "A haunting medieval lute melody with soft strings, slow and
            contemplative, evoking ancient forests and fading magic."
        negative_prompt: Elements to exclude.
            Example: "drums, vocals, electronic sounds, modern instruments."

    Returns:
        dict with keys:
            audio_url: Relative URL path to the saved audio (e.g. /api/music/abc.wav).
            duration_seconds: Approximate track duration.
            description: The prompt used to generate the music.
            error: Present only if generation failed.
    """
    try:
        logger.info(f"[Lyria] Generating music: '{prompt[:80]}'")

        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_request = google.auth.transport.requests.Request()
        credentials.refresh(auth_request)

        url = (
            f"https://{LOCATION}-aiplatform.googleapis.com/v1/"
            f"projects/{PROJECT_ID}/locations/{LOCATION}/"
            f"publishers/google/models/lyria-002:predict"
        )

        instance = {"prompt": prompt}
        if negative_prompt:
            instance["negative_prompt"] = negative_prompt

        payload = {"instances": [instance], "parameters": {}}

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

        import base64

        audio_b64 = (
            predictions[0].get("bytesBase64Encoded")
            or predictions[0].get("audioContent", "")
        )
        audio_bytes = base64.b64decode(audio_b64)
        mime_type = predictions[0].get("mimeType", "audio/wav")
        ext = "wav" if "wav" in mime_type else "mp3"

        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = MUSIC_CACHE_DIR / filename
        filepath.write_bytes(audio_bytes)

        logger.info(f"[Lyria] ✅ Saved {filename} ({len(audio_bytes):,} bytes)")

        return {
            "audio_url": f"/api/music/{filename}",
            "duration_seconds": 33,
            "description": prompt,
        }

    except Exception as e:
        logger.error(f"[Lyria] ❌ Music generation failed: {e}")
        return {"error": str(e)}
