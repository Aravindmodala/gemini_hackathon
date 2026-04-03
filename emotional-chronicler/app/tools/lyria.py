"""
Lyria — AI music generation tool for storytelling.

Generates instrumental music tracks from text prompts using
Google's Lyria 2 model on Vertex AI.
Saves audio to Google Cloud Storage for persistent access.

API Reference:
  https://cloud.google.com/vertex-ai/generative-ai/docs/music/generate-music
"""

import base64
import logging
import uuid

import google.auth
import google.auth.transport.requests
import httpx

from app.config import PROJECT_ID, LOCATION, MUSIC_CACHE_DIR, LYRIA_MODEL, upload_to_gcs

logger = logging.getLogger("chronicler")

LYRIA_TRACK_DURATION_SECONDS = 33


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
            audio_url: URL to the saved audio (GCS public URL or local fallback).
            duration_seconds: Approximate track duration.
            description: The prompt used to generate the music.
            error: Present only if generation failed.
    """
    try:
        logger.info("[Lyria] Generating music: '%s'", prompt[:80])

        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_request = google.auth.transport.requests.Request()
        credentials.refresh(auth_request)

        url = (
            f"https://{LOCATION}-aiplatform.googleapis.com/v1/"
            f"projects/{PROJECT_ID}/locations/{LOCATION}/"
            f"publishers/google/models/{LYRIA_MODEL}:predict"
        )

        instance = {"prompt": prompt}
        if negative_prompt:
            instance["negative_prompt"] = negative_prompt

        payload = {"instances": [instance], "parameters": {}}

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(url, json=payload, headers={
                "Authorization": f"Bearer {credentials.token}",
                "Content-Type": "application/json",
            })
            response.raise_for_status()
            result = response.json()

        predictions = result.get("predictions", [])
        if not predictions:
            logger.warning("[Lyria] No predictions returned")
            return {"error": "No music generated"}

        audio_b64 = (
            predictions[0].get("bytesBase64Encoded")
            or predictions[0].get("audioContent", "")
        )
        audio_bytes = base64.b64decode(audio_b64)
        mime_type = predictions[0].get("mimeType", "audio/wav")
        ext = "wav" if "wav" in mime_type else "mp3"

        filename = f"{uuid.uuid4().hex}.{ext}"

        # Save to local cache (fast serving during current session)
        filepath = MUSIC_CACHE_DIR / filename
        filepath.write_bytes(audio_bytes)

        # Upload to GCS (persistent storage)
        content_type = "audio/wav" if ext == "wav" else "audio/mpeg"
        try:
            gcs_url = upload_to_gcs(f"music/{filename}", audio_bytes, content_type)
            logger.info("[Lyria] Uploaded to GCS: %s (%s bytes)", filename, f"{len(audio_bytes):,}")
            audio_url = gcs_url
        except Exception as gcs_err:
            logger.warning("[Lyria] GCS upload failed, falling back to local: %s", gcs_err)
            audio_url = f"/api/music/{filename}"

        return {
            "audio_url": audio_url,
            "duration_seconds": LYRIA_TRACK_DURATION_SECONDS,
            "description": prompt,
        }

    except Exception as e:
        logger.error("[Lyria] Music generation failed: %s", e)
        return {"error": str(e)}
