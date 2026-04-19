"""Domain models for user profiles and preferences."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator


# ── Allowed values (used for validation) ───────────────────────────────────

ALLOWED_GENRES = frozenset({
    "Fantasy", "Sci-Fi", "Romance", "Thriller", "Mystery",
    "Literary Fiction", "Historical", "Magical Realism",
    "Horror", "Comedy", "Dystopian", "YA",
})

ALLOWED_TONES = frozenset({
    "Whimsical", "Dark", "Hopeful", "Melancholic",
    "Epic", "Intimate", "Philosophical", "Adventurous",
})

ALLOWED_THEMES = frozenset({
    "Coming-of-age", "Redemption", "Love", "Grief",
    "Identity", "Family", "Power", "Wonder", "Survival", "Friendship",
})

ALLOWED_ATMOSPHERES = frozenset({
    "Enchanted forests", "Deep space", "Bustling cities",
    "Remote villages", "Victorian drawing rooms",
    "Rainy noir streets", "Coastal towns", "Desert ruins",
})

_MAX_FREE_TAGS = 5
_MAX_TAG_LEN = 60


def _validate_free_tags(values: list[str], field_name: str) -> list[str]:
    """Validate freeform tag lists: strip, deduplicate, enforce count and length."""
    stripped = [v.strip() for v in values if v.strip()]
    if len(stripped) > _MAX_FREE_TAGS:
        raise ValueError(f"{field_name} must have at most {_MAX_FREE_TAGS} entries")
    for tag in stripped:
        if len(tag) > _MAX_TAG_LEN:
            raise ValueError(
                f"{field_name} tag '{tag[:20]}…' exceeds {_MAX_TAG_LEN} characters"
            )
    return stripped


def _validate_enum_list(values: list[str], allowed: frozenset[str], field_name: str) -> list[str]:
    """Validate that all values belong to the allowed set."""
    invalid = [v for v in values if v not in allowed]
    if invalid:
        raise ValueError(f"{field_name} contains invalid values: {invalid}")
    return values


# ── Preferences model ──────────────────────────────────────────────────────

class UserPreferences(BaseModel):
    """Story personalization preferences."""

    favorite_genres: list[str] = Field(default_factory=list)
    favorite_authors: Annotated[list[str], Field(default_factory=list)]
    favorite_books: Annotated[list[str], Field(default_factory=list)]
    tones: list[str] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)
    atmospheres: list[str] = Field(default_factory=list)

    @field_validator("favorite_genres")
    @classmethod
    def validate_genres(cls, v: list[str]) -> list[str]:
        return _validate_enum_list(v, ALLOWED_GENRES, "favorite_genres")

    @field_validator("favorite_authors")
    @classmethod
    def validate_authors(cls, v: list[str]) -> list[str]:
        return _validate_free_tags(v, "favorite_authors")

    @field_validator("favorite_books")
    @classmethod
    def validate_books(cls, v: list[str]) -> list[str]:
        return _validate_free_tags(v, "favorite_books")

    @field_validator("tones")
    @classmethod
    def validate_tones(cls, v: list[str]) -> list[str]:
        return _validate_enum_list(v, ALLOWED_TONES, "tones")

    @field_validator("themes")
    @classmethod
    def validate_themes(cls, v: list[str]) -> list[str]:
        return _validate_enum_list(v, ALLOWED_THEMES, "themes")

    @field_validator("atmospheres")
    @classmethod
    def validate_atmospheres(cls, v: list[str]) -> list[str]:
        return _validate_enum_list(v, ALLOWED_ATMOSPHERES, "atmospheres")

    @property
    def has_meaningful_prefs(self) -> bool:
        """Return True if at least one preference field is non-empty."""
        return any([
            self.favorite_genres,
            self.favorite_authors,
            self.favorite_books,
            self.tones,
            self.themes,
            self.atmospheres,
        ])


# ── Profile model ──────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    """Full user profile stored in Firestore users/{uid}."""

    uid: str
    display_name: str | None = None
    email: str | None = None
    photo_url: str | None = None
    created_at: datetime | None = None
    onboarded_at: datetime | None = None
    updated_at: datetime | None = None
    preferences: UserPreferences = Field(default_factory=UserPreferences)


# ── Request / Response schemas ─────────────────────────────────────────────

class UpsertUserRequest(BaseModel):
    """PUT /api/v1/users/me — full profile + preferences upsert."""

    display_name: str | None = None
    photo_url: str | None = None
    preferences: UserPreferences = Field(default_factory=UserPreferences)


class OnboardingCompleteRequest(BaseModel):
    """POST /api/v1/users/me/onboarding/complete — final wizard submission."""

    preferences: UserPreferences = Field(default_factory=UserPreferences)


class UserProfileResponse(BaseModel):
    """Response shape for GET and PUT /api/v1/users/me."""

    uid: str
    display_name: str | None = None
    email: str | None = None
    photo_url: str | None = None
    onboarded_at: datetime | None = None
    preferences: UserPreferences
