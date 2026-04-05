---
name: Emotional Chronicler Architecture & Model Migration
description: Key architectural decisions, model names, ADK SDK internals, and migration history for the Emotional Chronicler project
type: project
---

The project migrated from Gemini 3.1 Pro Preview + Imagen 4 tool to Gemini 3 Pro Image Preview (multimodal native text+image output model). The `generate_image` ADK tool has been removed; inline image parts are now handled directly in `routes.py`.

**Why:** Simplifies architecture by eliminating a separate Imagen API call; native multimodal output is interleaved with prose naturally.

**How to apply:** When reviewing image handling code, expect `part.inline_data` (a `google.genai.types.Blob`) on `genai_types.Part` objects from ADK event content. `part.inline_data.data` is raw `bytes` in memory (not base64 — base64 only applies during Pydantic JSON serialization via `ser_json_bytes='base64'` config on the Event model).

**ADK Event internals confirmed:**
- `Event` extends `LlmResponse` which has `content: Optional[types.Content]`
- `types.Content.parts` is `list[types.Part]`
- `types.Part.inline_data` is `Optional[types.Blob]`
- `types.Blob.data` is `Optional[bytes]` — raw bytes in memory
- `types.Blob.mime_type` is `Optional[str]`
- `part.function_response` exists on `types.Part` for tool responses

**Model name in use:** `gemini-3-pro-image-preview` (set in `config.py` STORY_MODEL default)

**imagen.py status:** Fully commented out (deprecated), kept only for git history. No active code.

**SSE event types emitted by routes.py:** session, title, text, image, music, done, error — all consumed by `useStoryteller.ts`.

**Inline image handling pattern (routes.py):** Gemini 3 Pro Image Preview emits `part.inline_data` with `mime_type` in `["image/png", "image/jpeg", "image/webp"]`. The handler writes to local `_image_cache/` then attempts GCS upload with fallback to local `/api/images/{filename}`. Known issue: `write_bytes` and `upload_to_gcs` are synchronous calls inside an async generator — both should be wrapped with `asyncio.to_thread`. Also: `mimetypes.guess_extension()` is OS-registry-dependent on Windows; prefer an explicit `_IMAGE_EXT_MAP` dict for reliable extension derivation.

**`generate_image` ADK tool:** Fully removed. The dead `function_response` branch for `generate_image` was cleaned up in feat/fixing_story. Only `generate_music` function_response is still handled.
