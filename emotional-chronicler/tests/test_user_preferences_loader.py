"""Unit tests for app/services/user_preferences_loader.py — preamble building and caching."""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone

from app.domain.user import UserPreferences, UserProfile
from app.services.user_preferences_loader import (
    UserPreferencesLoader,
    UserPreferencesContext,
)


# ── Helpers ───────────────────────────────────────────────────

def _profile_with_prefs(**prefs_kwargs) -> UserProfile:
    """Create a UserProfile with the given preferences."""
    return UserProfile(
        uid="test-user-123",
        display_name="Test User",
        email="test@example.com",
        onboarded_at=datetime.now(timezone.utc),
        preferences=UserPreferences(**prefs_kwargs),
    )


# ── _build_preamble (direct static-method tests) ─────────────

class TestBuildPreamble:
    """Tests for UserPreferencesLoader._build_preamble()."""

    def test_preamble_includes_genres_and_authors(self):
        """Genres + authors → 'Loves: Fantasy (genres); Neil Gaiman (authors)'."""
        prefs = UserPreferences(
            favorite_genres=["Fantasy"],
            favorite_authors=["Neil Gaiman"],
        )
        preamble = UserPreferencesLoader._build_preamble(prefs)

        assert "Fantasy (genres)" in preamble
        assert "Neil Gaiman (authors)" in preamble
        assert "Loves:" in preamble

    def test_preamble_includes_books(self):
        """Books → 'Favorite books/series: ...'."""
        prefs = UserPreferences(favorite_books=["Dune", "Neuromancer"])
        preamble = UserPreferencesLoader._build_preamble(prefs)

        assert "Favorite books/series:" in preamble
        assert "Dune" in preamble
        assert "Neuromancer" in preamble

    def test_preamble_includes_tones_lowercase(self):
        """Tones are joined and lowercased."""
        prefs = UserPreferences(tones=["Whimsical", "Dark"])
        preamble = UserPreferencesLoader._build_preamble(prefs)

        assert "Craves tones:" in preamble
        assert "whimsical" in preamble
        assert "dark" in preamble

    def test_preamble_includes_themes_lowercase(self):
        """Themes are joined and lowercased."""
        prefs = UserPreferences(themes=["Redemption", "Love"])
        preamble = UserPreferencesLoader._build_preamble(prefs)

        assert "Themes that resonate:" in preamble
        assert "redemption" in preamble
        assert "love" in preamble

    def test_preamble_includes_atmospheres_lowercase(self):
        """Atmospheres are joined and lowercased."""
        prefs = UserPreferences(atmospheres=["Deep space", "Desert ruins"])
        preamble = UserPreferencesLoader._build_preamble(prefs)

        assert "Atmospheres:" in preamble
        assert "deep space" in preamble
        assert "desert ruins" in preamble

    def test_preamble_omits_empty_fields(self):
        """Empty tones → no 'Craves tones:' line."""
        prefs = UserPreferences(favorite_genres=["Fantasy"])
        preamble = UserPreferencesLoader._build_preamble(prefs)

        assert "Craves tones:" not in preamble
        assert "Themes that resonate:" not in preamble
        assert "Atmospheres:" not in preamble
        assert "Favorite books/series:" not in preamble

    def test_preamble_starts_with_reader_profile_header(self):
        """Preamble opens with the READER PROFILE header."""
        prefs = UserPreferences(favorite_genres=["Fantasy"])
        preamble = UserPreferencesLoader._build_preamble(prefs)

        assert preamble.startswith("READER PROFILE")


# ── Loader behavior (async) ───────────────────────────────────

class TestLoaderBehavior:
    """Tests for UserPreferencesLoader.load() — async integration."""

    def _fresh_loader(self) -> UserPreferencesLoader:
        loader = UserPreferencesLoader()
        loader._cache.clear()
        return loader

    @pytest.mark.asyncio
    async def test_load_returns_empty_when_not_authenticated(self):
        """is_authenticated=False → applied=False, preamble=''."""
        loader = self._fresh_loader()
        result = await loader.load(user_id="test-user-123", is_authenticated=False)

        assert result.applied is False
        assert result.preamble == ""

    @pytest.mark.asyncio
    async def test_load_returns_empty_when_no_prefs(self):
        """Authenticated, but profile has empty prefs → applied=False."""
        loader = self._fresh_loader()
        profile = _profile_with_prefs()

        with patch.object(loader._store, "get", return_value=profile):
            result = await loader.load(user_id="test-user-123", is_authenticated=True)

        assert result.applied is False
        assert result.preamble == ""

    @pytest.mark.asyncio
    async def test_load_returns_preamble_when_prefs_set(self):
        """Authenticated, profile has genres → applied=True with preamble."""
        loader = self._fresh_loader()
        profile = _profile_with_prefs(favorite_genres=["Fantasy"])

        with patch.object(loader._store, "get", return_value=profile):
            result = await loader.load(user_id="preamble-user", is_authenticated=True)

        assert result.applied is True
        assert "Fantasy" in result.preamble

    @pytest.mark.asyncio
    async def test_load_caches_result(self):
        """Calling load() twice with same uid only calls store once."""
        loader = self._fresh_loader()
        profile = _profile_with_prefs(favorite_genres=["Sci-Fi"])

        with patch.object(loader._store, "get", return_value=profile) as mock_get:
            first = await loader.load(user_id="cache-user", is_authenticated=True)
            second = await loader.load(user_id="cache-user", is_authenticated=True)

        assert first.applied is True
        assert second.applied is True
        mock_get.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_expires_after_ttl(self):
        """After 60s TTL, store is called again."""
        loader = self._fresh_loader()
        profile = _profile_with_prefs(favorite_genres=["Fantasy"])

        with patch.object(loader._store, "get", return_value=profile) as mock_get, \
             patch("app.services.user_preferences_loader.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0
            await loader.load(user_id="ttl-user", is_authenticated=True)

            mock_time.monotonic.return_value = 1061.0
            await loader.load(user_id="ttl-user", is_authenticated=True)

        assert mock_get.call_count == 2
