"""Typed story event models — the v2 Firestore schema source of truth.

Every event written to the `events[]` array in Firestore is one of these types.
The `seq` field is a monotonically increasing integer assigned by StoryStreamOrchestrator
and is the authoritative ordering key for session replay.

Schema version this module represents: 2
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

SCHEMA_VERSION = 2


class _BaseEvent(BaseModel):
    seq: int
    ts: str  # ISO 8601 UTC string


class UserPromptEvent(_BaseEvent):
    """The story prompt submitted by the user."""

    kind: Literal["user_prompt"]
    text: str


class TextSegmentEvent(_BaseEvent):
    """A prose segment of the story narrative.

    A single generation run may produce multiple TextSegmentEvents — one for
    each stretch of text between (or around) image markers. This preserves
    the exact interleaving of text and images in the narrative.
    """

    kind: Literal["text_segment"]
    text: str


class ImageEvent(_BaseEvent):
    """A generated illustration at a specific narrative position."""

    kind: Literal["image"]
    blob_path: str       # GCS path: "images/{session_id}/{filename}"
    image_url: str       # Served URL: "/api/v1/assets/images/{session_id}/{filename}"
    image_prompt: str    # The [[IMAGE_PROMPT: ...]] content (truncated to 500 chars)
    mime_type: str       # "image/png" | "image/jpeg" | "image/webp"
    gcs_ok: bool = True  # False if GCS upload failed (local cache only)


class MusicEvent(_BaseEvent):
    """An atmospheric music track at a specific narrative position."""

    kind: Literal["music"]
    blob_path: str
    audio_url: str
    duration_seconds: float


# Discriminated union — the single type for any event read from or written to Firestore.
StoryEvent = Annotated[
    Union[UserPromptEvent, TextSegmentEvent, ImageEvent, MusicEvent],
    Field(discriminator="kind"),
]


def parse_event(raw: dict) -> StoryEvent:
    """Deserialize a raw Firestore dict into the correct StoryEvent subtype.

    Raises ValidationError if the dict does not match any known event kind.
    """
    # Pydantic's discriminated union resolution
    from pydantic import TypeAdapter
    _adapter = TypeAdapter(StoryEvent)
    return _adapter.validate_python(raw)
