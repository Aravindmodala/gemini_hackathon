"""Loads user preferences from Firestore and builds the Reader Profile preamble."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from app.core.user_store import UserPreferencesStore
from app.domain.user import UserPreferences

logger = logging.getLogger("chronicler")

_CACHE_TTL_SECONDS = 60


@dataclass
class _CacheEntry:
    preamble: str
    applied: bool
    expires_at: float


@dataclass
class UserPreferencesContext:
    """Result of loading user preferences."""

    applied: bool
    preamble: str

    @staticmethod
    def empty() -> "UserPreferencesContext":
        return UserPreferencesContext(applied=False, preamble="")


class UserPreferencesLoader:
    """
    Loads user preferences and builds a Reader Profile preamble for Elora.

    Results are cached in memory for 60 seconds per uid to avoid a Firestore
    read on every story generation request.
    """

    _cache: dict[str, _CacheEntry] = {}

    def __init__(self) -> None:
        self._store = UserPreferencesStore()

    async def load(self, *, user_id: str, is_authenticated: bool) -> UserPreferencesContext:
        """Load prefs and return a preamble context.

        Returns UserPreferencesContext.empty() when the user is not authenticated,
        or when no meaningful preferences are stored.
        """
        if not is_authenticated:
            return UserPreferencesContext.empty()

        cached = self._get_cached(user_id)
        if cached is not None:
            return cached

        profile = await asyncio.to_thread(self._store.get, user_id)
        if not profile or not profile.preferences.has_meaningful_prefs:
            result = UserPreferencesContext.empty()
        else:
            preamble = self._build_preamble(profile.preferences)
            result = UserPreferencesContext(applied=True, preamble=preamble)

        self._set_cache(user_id, result)
        return result

    # ── Cache helpers ────────────────────────────────────────────────────────

    def _get_cached(self, uid: str) -> UserPreferencesContext | None:
        entry = self._cache.get(uid)
        if entry and time.monotonic() < entry.expires_at:
            return UserPreferencesContext(applied=entry.applied, preamble=entry.preamble)
        return None

    def _set_cache(self, uid: str, ctx: UserPreferencesContext) -> None:
        self._cache[uid] = _CacheEntry(
            preamble=ctx.preamble,
            applied=ctx.applied,
            expires_at=time.monotonic() + _CACHE_TTL_SECONDS,
        )

    # ── Preamble builder ─────────────────────────────────────────────────────

    @staticmethod
    def _build_preamble(prefs: UserPreferences) -> str:
        """Build the Reader Profile preamble injected before Elora's prompt."""
        lines: list[str] = [
            "READER PROFILE — tailor tone, themes, setting, and voice to this reader.",
            "Do NOT list these back to the reader.",
            "",
        ]

        if prefs.favorite_genres or prefs.favorite_authors:
            parts: list[str] = []
            if prefs.favorite_genres:
                parts.append(", ".join(prefs.favorite_genres) + " (genres)")
            if prefs.favorite_authors:
                parts.append(", ".join(prefs.favorite_authors) + " (authors)")
            lines.append(f"- Loves: {'; '.join(parts)}")

        if prefs.favorite_books:
            lines.append(f"- Favorite books/series: {', '.join(prefs.favorite_books)}")

        if prefs.tones:
            lines.append(f"- Craves tones: {', '.join(prefs.tones).lower()}")

        if prefs.themes:
            lines.append(f"- Themes that resonate: {', '.join(prefs.themes).lower()}")

        if prefs.atmospheres:
            lines.append(f"- Atmospheres: {', '.join(prefs.atmospheres).lower()}")

        return "\n".join(lines)
