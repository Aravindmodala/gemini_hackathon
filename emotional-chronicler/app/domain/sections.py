"""Story section models and the canonical events → sections conversion.

StorySection mirrors the frontend's discriminated union type:
  | { type: 'text';  content: string }
  | { type: 'image'; url: string; caption: string }
  | { type: 'music'; url: string; duration: number }

events_to_sections() is a pure function (no I/O). It is the single authoritative
reconstruction algorithm used by both:
  - session_query_service.py (backend — pre-computes sections for API response)
  - useSessionReplay.ts (frontend — fallback for v1 legacy sessions)
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Section types
# ---------------------------------------------------------------------------

class TextSection(BaseModel):
    type: Literal["text"]
    content: str


class ImageSection(BaseModel):
    type: Literal["image"]
    url: str
    caption: str = ""


class MusicSection(BaseModel):
    type: Literal["music"]
    url: str
    duration: float = 0.0


StorySection = Annotated[
    Union[TextSection, ImageSection, MusicSection],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------
# Reconstruction
# ---------------------------------------------------------------------------

def events_to_sections(events: list[Any]) -> list[dict]:
    """Convert an ordered list of StoryEvent objects to a StorySection list.

    Accepts both parsed Pydantic objects and raw dicts (for callers that haven't
    run parse_event() yet). Returns plain dicts so the result is directly
    JSON-serialisable without a further .model_dump() call.

    The events must be sorted by `seq` before calling this function, or pass
    them unsorted and set sort=True.

    Args:
        events: List of StoryEvent instances or raw dicts with a ``kind`` field.

    Returns:
        List of section dicts compatible with the frontend StorySection type.
    """
    sections: list[dict] = []

    for event in sorted(events, key=_seq_key):
        kind = _get_field(event, "kind")

        if kind == "text_segment":
            text = _get_field(event, "text", "")
            if text.strip():
                # Merge consecutive text sections to avoid fragmentation
                if sections and sections[-1]["type"] == "text":
                    sections[-1]["content"] += "\n\n" + text.strip()
                else:
                    sections.append({"type": "text", "content": text.strip()})

        elif kind == "image":
            url = _get_field(event, "image_url", "")
            prompt = _get_field(event, "image_prompt", "")
            if url:
                sections.append({"type": "image", "url": url, "caption": prompt[:120]})

        elif kind == "music":
            url = _get_field(event, "audio_url", "")
            duration = _get_field(event, "duration_seconds", 0.0)
            if url:
                sections.append({"type": "music", "url": url, "duration": duration})

        # user_prompt events are intentionally skipped — not rendered in StoryView

    return sections


def legacy_interactions_to_sections(interactions: list[dict]) -> list[dict]:
    """Reconstruct sections from a v1 interactions[] array.

    This is the fallback path for sessions written before schema_version 2.
    It replicates the previous StoryPage.tsx reconstruction logic on the server
    so the frontend never needs to do it.

    The v1 interactions array stores text as one or more elora entries interleaved
    with tool entries. Text is accumulated until a tool entry is encountered,
    then flushed before the tool's section is added.
    """
    sections: list[dict] = []
    text_buffer: list[str] = []

    def flush_text() -> None:
        combined = "\n\n".join(t.strip() for t in text_buffer if t.strip())
        if combined:
            sections.append({"type": "text", "content": combined})
        text_buffer.clear()

    for interaction in interactions:
        role = interaction.get("role", "")
        args: dict = interaction.get("args") or {}

        if role == "elora":
            text = interaction.get("text", "")
            if text:
                text_buffer.append(text)
            continue

        if role != "tool":
            continue

        name = interaction.get("name", "")

        if name in ("generate_image", "inline_image", "generated_image"):
            image_url = args.get("image_url") or args.get("url", "")
            if image_url:
                flush_text()
                sections.append({
                    "type": "image",
                    "url": image_url,
                    "caption": str(args.get("image_prompt", ""))[:120],
                })

        elif name == "generate_music":
            audio_url = args.get("audio_url") or args.get("url", "")
            duration = float(args.get("duration_seconds") or args.get("duration") or 0.0)
            if audio_url:
                flush_text()
                sections.append({"type": "music", "url": audio_url, "duration": duration})

    flush_text()
    return sections


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seq_key(event: Any) -> int:
    """Extract seq from either a Pydantic model or a raw dict."""
    if isinstance(event, dict):
        return event.get("seq", 0)
    return getattr(event, "seq", 0)


def _get_field(event: Any, field: str, default: Any = None) -> Any:
    """Read a field from either a Pydantic model or a raw dict."""
    if isinstance(event, dict):
        return event.get(field, default)
    return getattr(event, field, default)
