"""Session domain models — typed representations of Firestore session documents."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.domain.events import StoryEvent
from app.domain.sections import StorySection


class SessionSummary(BaseModel):
    """Lightweight session representation returned by GET /sessions (list view)."""

    session_id: str
    title: str
    status: str  # keeps loose str for legacy "unknown" values
    created_at: str | None
    updated_at: str | None
    interaction_count: int = 0
    preview: str = ""
    thumbnail_url: str | None = None


class SessionDetail(BaseModel):
    """Full session returned by GET /sessions/{id}.

    v1 sessions populate `interactions` and leave `events`/`sections` empty.
    v2 sessions populate `events` and `sections`; `interactions` is omitted.
    """

    session_id: str
    title: str
    status: str
    created_at: str | None
    updated_at: str | None
    schema_version: int = 1

    # v2 fields
    events: list[StoryEvent] = Field(default_factory=list)
    sections: list[StorySection] = Field(default_factory=list)

    # v1 legacy field — kept for backward compatibility during migration
    interactions: list[dict[str, Any]] = Field(default_factory=list)
