"""
Visual Engine — generates illustrations via Gemini 3 Pro Image Preview.

Stateless module: takes an image prompt, returns image bytes.
"""
import asyncio
import hashlib
import logging
import time
import uuid

from google.genai import types as genai_types
from app.config import VISUAL_MODEL, VISUAL_TIMEOUT_SECONDS, get_genai_client

logger = logging.getLogger("chronicler")

_VISUAL_SYSTEM_PROMPT = (
    "You are an image generation engine. Generate exactly one illustration. "
    "Follow the prompt precisely. No text overlays, no watermarks, no borders."
)


async def generate_image(
    image_prompt: str,
    timeout_seconds: float = VISUAL_TIMEOUT_SECONDS,
) -> tuple[bytes, str] | None:
    """Call the visual model to render an image from a prompt.

    Returns (image_bytes, mime_type) or None on failure.
    Never raises — all errors are caught and logged.
    """
    request_id = uuid.uuid4().hex[:8]
    prompt_text = (image_prompt or "").strip()
    prompt_hash = hashlib.sha1(prompt_text.encode("utf-8", errors="ignore")).hexdigest()[:12]
    prompt_len = len(prompt_text)
    started = time.perf_counter()

    logger.info(
        "[Visual] request_start id=%s model=%s timeout=%.1fs prompt_len=%d prompt_hash=%s",
        request_id,
        VISUAL_MODEL,
        timeout_seconds,
        prompt_len,
        prompt_hash,
    )

    try:
        client = get_genai_client()
        if hasattr(client, "aio") and hasattr(client.aio, "models"):
            generation_call = client.aio.models.generate_content(
                model=VISUAL_MODEL,
                contents=f"{_VISUAL_SYSTEM_PROMPT}\n\n{prompt_text}",
                config=genai_types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )
        else:
            generation_call = asyncio.to_thread(
                client.models.generate_content,
                model=VISUAL_MODEL,
                contents=f"{_VISUAL_SYSTEM_PROMPT}\n\n{prompt_text}",
                config=genai_types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )

        response = await asyncio.wait_for(
            generation_call,
            timeout=timeout_seconds,
        )
        elapsed = time.perf_counter() - started

        candidates = getattr(response, "candidates", None) or []
        logger.info(
            "[Visual] request_response id=%s elapsed=%.2fs candidates=%d",
            request_id,
            elapsed,
            len(candidates),
        )

        # Extract first image part from response
        if not candidates:
            logger.warning(
                "[Visual] request_no_candidates id=%s elapsed=%.2fs",
                request_id,
                elapsed,
            )
            return None

        parts = getattr(candidates[0].content, "parts", None) or []
        logger.info(
            "[Visual] request_parts id=%s part_count=%d",
            request_id,
            len(parts),
        )

        for idx, part in enumerate(parts):
            inline_data = getattr(part, "inline_data", None)
            if inline_data and getattr(inline_data, "mime_type", "").startswith("image/"):
                image_bytes = inline_data.data
                if isinstance(image_bytes, str):
                    import base64
                    image_bytes = base64.b64decode(image_bytes)
                size = len(image_bytes)
                mime_type = inline_data.mime_type
                logger.info(
                    "[Visual] request_success id=%s elapsed=%.2fs part_index=%d mime=%s bytes=%d",
                    request_id,
                    elapsed,
                    idx,
                    mime_type,
                    size,
                )
                return image_bytes, inline_data.mime_type

        logger.warning(
            "[Visual] request_no_image_part id=%s elapsed=%.2fs",
            request_id,
            elapsed,
        )
        return None

    except asyncio.TimeoutError:
        elapsed = time.perf_counter() - started
        logger.warning(
            "[Visual] request_timeout id=%s elapsed=%.2fs timeout=%.1fs prompt_len=%d prompt_hash=%s",
            request_id,
            elapsed,
            timeout_seconds,
            prompt_len,
            prompt_hash,
        )
        return None
    except Exception as e:
        elapsed = time.perf_counter() - started
        logger.warning(
            "[Visual] request_error id=%s elapsed=%.2fs error_type=%s error=%s prompt_len=%d prompt_hash=%s",
            request_id,
            elapsed,
            type(e).__name__,
            e,
            prompt_len,
            prompt_hash,
        )
        return None
