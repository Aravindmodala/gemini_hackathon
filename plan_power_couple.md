# Power Couple Migration Plan

Switch from single-model (`gemini-3-pro-image-preview` for text+images) to a two-model pipeline:
- **Narrative Engine**: `gemini-3.1-pro` (text-only, 1M+ context) — rich prose + embedded image-gen-ready prompts
- **Visual Engine**: `gemini-3-pro-image-preview` (image-only calls) — generates images directly from those prompts

**Frontend: ZERO changes required.** SSE event types remain identical.

---

## Architecture Overview

```
User prompt
    |
    v
ADK Runner (gemini-3.1-pro, text-only)
    |
    v  streams text chunks with [[IMAGE_PROMPT: ...]] markers
    |
Route handler detects [[IMAGE_PROMPT: ...]] markers
    |
    +---> Strip marker, emit text SSE events
    |
    +---> Send image prompt directly to Visual Engine
          (gemini-3-pro-image-preview, image-only)
              |
              v
          Returns image bytes
              |
              v
          Save to disk + GCS, emit image SSE event
```

---

## File Changes (7 files, 2 new)

### 1. `app/config.py` — Add model constants + GenAI client

```python
# Add new model constants (keep STORY_MODEL as alias for backward compat in tests)
NARRATIVE_MODEL = os.environ.get("NARRATIVE_MODEL", "gemini-3.1-pro")
VISUAL_MODEL = os.environ.get("VISUAL_MODEL", "gemini-3-pro-image-preview")
STORY_MODEL = NARRATIVE_MODEL  # alias for backward compat

# Add lazy GenAI client for visual engine
from google import genai

_genai_client: genai.Client | None = None

def get_genai_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client(
            vertexai=True, project=PROJECT_ID, location=LOCATION
        )
    return _genai_client
```

### 2. `app/core/agent.py` — Switch to text-only narrative model

```python
from app.config import NARRATIVE_MODEL, COMPANION_MODEL

elora_agent = Agent(
    name="elora",
    model=NARRATIVE_MODEL,                    # was STORY_MODEL (gemini-3-pro-image-preview)
    instruction=ELORA_SYSTEM_PROMPT,
    tools=[],
    # REMOVE generate_content_config with response_modalities=["TEXT", "IMAGE"]
    # Text-only is the default — no config needed
)
```

### 3. `app/prompts/elora.py` — Replace image instructions with image prompt markers

Replace the "NATIVE IMAGE GENERATION - MANDATORY" section (lines 36-51) with:

```
IMAGE PROMPT ENGINEERING - MANDATORY:
You do NOT generate images yourself. Instead, you embed image generation prompts in your prose.
These prompts are sent directly to an image generation model. The reader never sees them.

You are BOTH a master storyteller AND an expert prompt engineer for image generation models.

Format (must be exactly this):
  [[IMAGE_PROMPT: <image generation prompt here>]]

Place markers AFTER the paragraph they illustrate. Include at least 5 markers per story:
  1. THE OPENING — set the visual tone
  2. CHARACTER REVEAL — first appearance of a major character  
  3. THE TURNING POINT — the moment the story pivots
  4. THE CLIMAX — peak of action or emotion
  5. THE FINAL IMAGE — closing visual that lingers

Write prompts as KEYWORD-RICH image generation prompts, NOT prose descriptions.
Each prompt MUST include these elements as comma-separated tags:
  - Subject and action (who/what is in the frame)
  - Setting and environment
  - Composition and camera angle (wide shot, close-up, low angle, bird's eye, etc.)
  - Lighting (golden hour, volumetric, rim lighting, dramatic shadows, etc.)
  - Color palette (warm amber tones, cool blue-violet, muted earth tones, etc.)
  - Art style matching the genre (comic book ink style, painterly digital art, cinematic photorealism, etc.)
  - Mood/atmosphere (ethereal, menacing, serene, chaotic, etc.)
  - Quality tags (highly detailed, 4K, cinematic composition, masterpiece, etc.)

Example:
  [[IMAGE_PROMPT: lone knight in dented silver armor kneeling before shattered obsidian throne,
  crumbling Gothic cathedral interior, golden hour light through broken stained glass windows,
  volumetric god rays, dust particles in amber light, wide-angle establishing shot,
  painterly digital art, epic dark fantasy, deep burgundy and gold palette,
  reverent and melancholy atmosphere, highly detailed, 4K, cinematic composition]]

STYLE ANCHOR: Your first image prompt sets the visual style for the whole story.
All subsequent prompts must maintain that same style for visual consistency.

CRITICAL: Write LONGER and RICHER prose than you normally would. Target 3000+ words.
You are freed from image generation overhead — use that freedom to deepen the narrative.
```

Keep everything else (title contract, genre-adaptive writing, core craft, absolute rules, ending).

### 4. `app/core/visual_engine.py` — NEW FILE

```python
"""
Visual Engine — generates illustrations via Gemini 3 Pro Image Preview.

Stateless module: takes a image prompt, returns image bytes.
"""
import asyncio
import logging

from google.genai import types as genai_types
from app.config import VISUAL_MODEL, get_genai_client

logger = logging.getLogger("chronicler")

_VISUAL_SYSTEM_PROMPT = (
    "You are an image generation engine. Generate exactly one illustration. "
    "Follow the prompt precisely. No text overlays, no watermarks, no borders."
)

async def generate_image(
    image_prompt: str,
    timeout_seconds: float = 45,
) -> tuple[bytes, str] | None:
    """Call the visual model to render an image from a prompt.

    Returns (image_bytes, mime_type) or None on failure.
    Never raises — all errors are caught and logged.
    """
    try:
        client = get_genai_client()
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=VISUAL_MODEL,
                contents=f"{_VISUAL_SYSTEM_PROMPT}\n\n{image_prompt}",
                config=genai_types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            ),
            timeout=timeout_seconds,
        )

        # Extract first image part from response
        if not response.candidates:
            logger.warning("[Visual] No candidates in response")
            return None

        for part in response.candidates[0].content.parts:
            inline_data = getattr(part, "inline_data", None)
            if inline_data and getattr(inline_data, "mime_type", "").startswith("image/"):
                image_bytes = inline_data.data
                if isinstance(image_bytes, str):
                    import base64
                    image_bytes = base64.b64decode(image_bytes)
                return image_bytes, inline_data.mime_type

        logger.warning("[Visual] No image part found in response")
        return None

    except asyncio.TimeoutError:
        logger.warning("[Visual] Image generation timed out after %ss", timeout_seconds)
        return None
    except Exception as e:
        logger.warning("[Visual] Image generation failed: %s", e)
        return None
```

### 5. `app/server/prompt_parser.py` — NEW FILE

```python
"""
Image prompt marker parser for the Power Couple pipeline.

Extracts [[IMAGE_PROMPT: ...]] markers from streaming text chunks,
handling markers that may span multiple chunks.
"""
import re

_IMAGE_PROMPT_RE = re.compile(r"\[\[IMAGE_PROMPT:\s*(.*?)\]\]", re.DOTALL)
_IMAGE_PROMPT_PREFIX = "[[IMAGE_PROMPT:"

def extract_and_strip_prompts(text: str) -> tuple[str, list[str]]:
    """Extract all complete image prompt markers and return cleaned text + image prompts.

    Returns:
        (visible_text, image_prompts) — text with markers removed, list of image prompts
    """
    prompts = [m.group(1).strip() for m in _IMAGE_PROMPT_RE.finditer(text)]
    cleaned = _IMAGE_PROMPT_RE.sub("", text)
    return cleaned, prompts


def has_partial_marker(text: str) -> bool:
    """Check if text ends with an incomplete [[IMAGE_PROMPT: ... (no closing ]])."""
    last_open = text.rfind("[[IMAGE_PROMPT:")
    if last_open == -1:
        return False
    last_close = text.find("]]", last_open)
    return last_close == -1
```

### 6. `app/server/routes.py` — Integrate prompt parser + visual engine

**Remove:**
- `_extract_inline_image()` function (lines 83-97)
- `_coerce_image_bytes()` function (lines 67-80)
- Inline image handling block (lines 432-475)

**Add imports:**
```python
from app.core.visual_engine import generate_image
from app.server.prompt_parser import extract_and_strip_prompts, has_partial_marker
```

**New state variable in `event_stream()`:**
```python
prompt_buffer: str = ""        # accumulates text to detect markers spanning chunks
image_prompts_processed: int = 0
```

**Replace the text chunk handling (lines 390-430) with:**

```python
text_value = getattr(part, "text", None)
if text_value:
    # --- Title extraction (unchanged) ---
    # ... existing title_buffer logic stays the same ...

    if visible_text:
        # Accumulate in prompt buffer for marker detection
        prompt_buffer += visible_text

        # Check for partial marker at end — keep buffering if so
        if has_partial_marker(prompt_buffer):
            continue

        # Extract complete image prompt markers
        cleaned_text, image_prompts = extract_and_strip_prompts(prompt_buffer)
        prompt_buffer = ""

        # Emit cleaned text
        if cleaned_text.strip():
            text_chunks_seen += 1
            yield format_sse_event({"type": "text", "chunk": cleaned_text})
            elora_text_buffer.append(cleaned_text)
            elora_buffered_chars += len(cleaned_text)

        # Generate images for each image prompt marker (sequential, interleaved)
        for image_prompt in image_prompts:
            image_prompts_processed += 1
            logger.info("[Visual] Generating image %d: %.80s...", image_prompts_processed, image_prompt)

            result = await generate_image(image_prompt)
            if result is None:
                logger.warning("[Visual] Image generation failed, skipping")
                continue

            image_bytes, mime = result
            if len(image_bytes) > MAX_IMAGE_BYTES:
                logger.warning("[Image] Oversized image skipped (%d bytes)", len(image_bytes))
                continue

            # Save + emit (same logic as before)
            ext = _IMAGE_EXT_MAP.get(mime, ".bin")
            filename = f"{uuid.uuid4().hex}{ext}"
            filepath = IMAGE_CACHE_DIR / filename
            await asyncio.to_thread(filepath.write_bytes, image_bytes)

            blob_path = f"images/{session_id}/{filename}"
            image_url = f"/api/v1/assets/images/{session_id}/{filename}"
            try:
                await asyncio.to_thread(upload_to_gcs, blob_path, image_bytes, mime)
            except Exception as gcs_err:
                logger.warning("[Image] GCS upload failed: %s", gcs_err)

            yield format_sse_event({"type": "image", "url": image_url, "caption": ""})
            images_emitted += 1

            if store:
                await asyncio.to_thread(store.log_tool_call, "generated_image", {
                    "image_url": image_url,
                    "blob_path": blob_path,
                    "image_prompt": image_prompt[:500],
                })

        # Flush to Firestore periodically
        if store and elora_buffered_chars >= ELORA_FLUSH_CHARS:
            await asyncio.to_thread(store.log_interaction, "elora", "".join(elora_text_buffer))
            elora_text_buffer.clear()
            elora_buffered_chars = 0
```

**At stream end (before `yield done`):** flush any remaining `prompt_buffer` text.

### 7. `app/server/factory.py` — Update startup logging

Log both model names:
```python
logger.info("Narrative model: %s | Visual model: %s", NARRATIVE_MODEL, VISUAL_MODEL)
```

---

## What Stays the Same

- **Frontend** — zero changes, same SSE events
- **Companion flow** — unchanged (uses gemini-2.0-flash, text-only already)
- **Session/Firestore persistence** — same structure
- **GCS upload + asset serving** — same endpoints
- **Auth middleware** — unchanged
- **Heartbeat/keep-alive** — unchanged (still emits `thinking` pings during image gen)
- **Title extraction** — `[[TITLE: ...]]` contract unchanged

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Model doesn't emit `[[IMAGE_PROMPT: ...]]` reliably | Robust regex + fallback: if 0 images at end, log warning (already exists) |
| Image prompt marker spans multiple text chunks | `prompt_buffer` + `has_partial_marker()` handles this |
| Image gen adds latency (5-15s per image) | Interleaved: user reads prose while image generates. Heartbeat pings keep connection alive |
| Visual style inconsistency across images | "STYLE ANCHOR" prompt instruction + first marker sets tone |
| Image gen fails | `generate_image` never raises, returns None, story continues |

---

## Environment Variables (new)

```bash
NARRATIVE_MODEL=gemini-3.1-pro          # text-only story engine (default)
VISUAL_MODEL=gemini-3-pro-image-preview # image generation engine (default)
```

Old `STORY_MODEL` env var still works (aliased to `NARRATIVE_MODEL`).

---

## Verification

1. **Unit test `prompt_parser.py`**: markers in single chunk, spanning chunks, no markers, malformed markers
2. **Unit test `visual_engine.py`**: mock GenAI client, test success/failure/timeout paths
3. **Update `test_routes.py`**: mock `generate_image` instead of `_extract_inline_image`, feed text events with `[[IMAGE_PROMPT:...]]` markers
4. **Manual e2e test**: `curl -X POST http://localhost:3001/api/v1/stories -H "Content-Type: application/json" -d '{"prompt": "A short magical fantasy story"}' --no-buffer`
5. **Verify**: SSE stream shows text events with no `[[IMAGE_PROMPT:...]]` markers visible, image events appear at image prompt positions
6. **Check frontend**: story renders with interleaved prose and images as before

---

## Implementation Order

1. `config.py` — add constants + client (safe, no behavioral change)
2. `visual_engine.py` — create new module
3. `prompt_parser.py` — create new module  
4. `elora.py` — rewrite prompt (image prompt markers instead of native images)
5. `agent.py` — switch model, remove `response_modalities`
6. `routes.py` — integrate prompt parser + visual engine
7. `factory.py` — update logging
8. Update tests
