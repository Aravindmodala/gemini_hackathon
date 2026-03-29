"""
Imagen 4 — story illustration tool for the ADK agent.

Generates scene illustrations using Google's Imagen 4 model on Vertex AI.
Designed as a plain async function so the Google ADK can register it as a tool.

API Reference:
  https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images
"""

import logging
import uuid

from google.genai import types as genai_types

from app.config import get_genai_client, IMAGEN_MODEL, IMAGE_CACHE_DIR

logger = logging.getLogger("chronicler")


async def generate_image(
    scene_description: str,
    style: str = "cinematic fantasy illustration, painterly, atmospheric, highly detailed",
) -> dict:
    """Generate an illustration for the current story scene.

    Call this at key visual moments: the opening scene of a new chapter,
    a character's first appearance, a dramatic turning point, or a setting
    so vivid it deserves to be seen. Do NOT call this more than once every
    three to four paragraphs — let the story breathe between images.

    Args:
        scene_description: Detailed visual description of what to illustrate.
            Be specific: describe lighting, mood, characters, colours, time of day,
            weather, and any important objects. Write it as you would describe a
            painting to an artist.
        style: Visual style keywords appended to the prompt. Defaults to
            cinematic fantasy illustration style.

    Returns:
        dict with keys:
            image_url: Absolute URL to the saved image (e.g. http://localhost:3000/api/images/abc.png).
            caption: Short caption derived from the scene description.
            error: Present only if generation failed.
    """
    try:
        full_prompt = f"{scene_description}. Style: {style}"
        logger.info("[Imagen] Generating: '%.80s...'", scene_description)

        response = get_genai_client().models.generate_images(
            model=IMAGEN_MODEL,
            prompt=full_prompt,
            config=genai_types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="16:9",
                safety_filter_level="BLOCK_MEDIUM_AND_ABOVE",
                person_generation="ALLOW_ADULT",
            ),
        )

        if not response.generated_images:
            logger.warning("[Imagen] No images returned")
            return {"error": "Imagen returned no images"}

        image_bytes = response.generated_images[0].image.image_bytes
        filename = f"{uuid.uuid4().hex}.png"
        filepath = IMAGE_CACHE_DIR / filename
        filepath.write_bytes(image_bytes)

        logger.info("[Imagen] Saved %s (%s bytes)", filename, f"{len(image_bytes):,}")

        return {
            "image_url": f"/api/images/{filename}",
            "caption": scene_description[:140],
        }

    except Exception as e:
        logger.error("[Imagen] Failed: %s", e)
        return {"error": str(e)}
