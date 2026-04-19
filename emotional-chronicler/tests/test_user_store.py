"""Unit tests for app/core/user_store.py and app/domain/user.UserPreferences validation."""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from datetime import datetime, timezone
from pydantic import ValidationError

from app.domain.user import UserPreferences, UserProfile


# ── Helpers ───────────────────────────────────────────────────

def _make_user_store():
    """Create a UserPreferencesStore with a mocked Firestore client."""
    with patch("app.core.user_store._get_db") as mock_get_db:
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        from app.core.user_store import UserPreferencesStore
        store = UserPreferencesStore()
    return store, mock_db


def _make_user_store_no_db():
    """Create a UserPreferencesStore with Firestore unavailable."""
    with patch("app.core.user_store._get_db") as mock_get_db:
        mock_get_db.return_value = None
        from app.core.user_store import UserPreferencesStore
        store = UserPreferencesStore()
    return store


# ── UserPreferences validation ────────────────────────────────

class TestUserPreferencesValidation:
    """Tests for Pydantic validation on UserPreferences fields."""

    def test_empty_preferences_valid(self):
        """Empty lists on all fields pass validation."""
        prefs = UserPreferences()
        assert prefs.favorite_genres == []
        assert prefs.favorite_authors == []
        assert prefs.favorite_books == []
        assert prefs.tones == []
        assert prefs.themes == []
        assert prefs.atmospheres == []

    def test_valid_genres_accepted(self):
        """Known genre values pass validation."""
        prefs = UserPreferences(favorite_genres=["Fantasy", "Sci-Fi"])
        assert prefs.favorite_genres == ["Fantasy", "Sci-Fi"]

    def test_invalid_genre_raises(self):
        """Unknown genre value raises ValidationError."""
        with pytest.raises(ValidationError):
            UserPreferences(favorite_genres=["InvalidGenre"])

    def test_invalid_tone_raises(self):
        """Unknown tone value raises ValidationError."""
        with pytest.raises(ValidationError):
            UserPreferences(tones=["Sad"])

    def test_invalid_theme_raises(self):
        """Unknown theme value raises ValidationError."""
        with pytest.raises(ValidationError):
            UserPreferences(themes=["RandomTheme"])

    def test_invalid_atmosphere_raises(self):
        """Unknown atmosphere value raises ValidationError."""
        with pytest.raises(ValidationError):
            UserPreferences(atmospheres=["Open ocean"])

    def test_authors_max_5_enforced(self):
        """More than 5 authors raises ValidationError."""
        with pytest.raises(ValidationError):
            UserPreferences(favorite_authors=["A", "B", "C", "D", "E", "F"])

    def test_books_max_5_enforced(self):
        """More than 5 books raises ValidationError."""
        with pytest.raises(ValidationError):
            UserPreferences(favorite_books=["A", "B", "C", "D", "E", "F"])

    def test_author_tag_too_long_raises(self):
        """Author tag exceeding 60 characters raises ValidationError."""
        long_tag = "A" * 61
        with pytest.raises(ValidationError):
            UserPreferences(favorite_authors=[long_tag])

    def test_has_meaningful_prefs_false_when_empty(self):
        """All-empty preferences returns False."""
        prefs = UserPreferences()
        assert prefs.has_meaningful_prefs is False

    def test_has_meaningful_prefs_true_when_any_set(self):
        """One non-empty field returns True."""
        prefs = UserPreferences(favorite_genres=["Fantasy"])
        assert prefs.has_meaningful_prefs is True


# ── UserPreferencesStore.get() ────────────────────────────────

class TestUserPreferencesStoreGet:
    """Tests for UserPreferencesStore.get()."""

    def test_get_returns_none_when_db_unavailable(self):
        """_get_db() returns None → get() returns None."""
        store = _make_user_store_no_db()

        with patch("app.core.user_store._get_db", return_value=None):
            result = store.get("test-user-123")

        assert result is None

    def test_get_returns_none_when_doc_not_found(self):
        """doc.exists is False → get() returns None."""
        store, mock_db = _make_user_store()
        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc

        with patch("app.core.user_store._get_db", return_value=mock_db):
            result = store.get("test-user-123")

        assert result is None

    def test_get_returns_profile_when_found(self):
        """doc has full data → returns UserProfile."""
        store, mock_db = _make_user_store()
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "display_name": "Test User",
            "email": "test@example.com",
            "photo_url": None,
            "onboarded_at": None,
            "preferences": {
                "favorite_genres": ["Fantasy"],
                "favorite_authors": [],
                "favorite_books": [],
                "tones": [],
                "themes": [],
                "atmospheres": [],
            },
        }
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc

        with patch("app.core.user_store._get_db", return_value=mock_db):
            result = store.get("test-user-123")

        assert result is not None
        assert isinstance(result, UserProfile)
        assert result.uid == "test-user-123"
        assert result.display_name == "Test User"
        assert result.preferences.favorite_genres == ["Fantasy"]


# ── UserPreferencesStore.get_or_create() ──────────────────────

class TestUserPreferencesStoreGetOrCreate:
    """Tests for UserPreferencesStore.get_or_create()."""

    def test_get_or_create_returns_existing_when_found(self):
        """Existing profile → returns it without creating a new one."""
        store, mock_db = _make_user_store()
        existing_profile = UserProfile(
            uid="test-user-123",
            display_name="Existing User",
            email="existing@example.com",
            preferences=UserPreferences(favorite_genres=["Fantasy"]),
        )

        with patch.object(store, "get", return_value=existing_profile):
            result = store.get_or_create("test-user-123", display_name="New Name")

        assert result.display_name == "Existing User"
        assert result.preferences.favorite_genres == ["Fantasy"]

    def test_get_or_create_creates_stub_when_not_found(self):
        """No existing profile → creates stub with onboarded_at=None."""
        store, mock_db = _make_user_store()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref

        with patch.object(store, "get", return_value=None), \
             patch("app.core.user_store._get_db", return_value=mock_db):
            result = store.get_or_create(
                "test-user-123",
                display_name="Test User",
                email="test@example.com",
            )

        assert result.uid == "test-user-123"
        assert result.onboarded_at is None
        assert result.display_name == "Test User"
        mock_doc_ref.set.assert_called_once()
        call_data = mock_doc_ref.set.call_args[0][0]
        assert call_data["onboarded_at"] is None


# ── UserPreferencesStore.upsert() ─────────────────────────────

class TestUserPreferencesStoreUpsert:
    """Tests for UserPreferencesStore.upsert()."""

    def test_upsert_calls_set_with_merge(self):
        """upsert() calls Firestore .set(data, merge=True)."""
        store, mock_db = _make_user_store()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref
        prefs = UserPreferences(favorite_genres=["Fantasy"])

        with patch("app.core.user_store._get_db", return_value=mock_db):
            store.upsert("test-user-123", preferences=prefs)

        mock_doc_ref.set.assert_called_once()
        call_args, call_kwargs = mock_doc_ref.set.call_args
        assert call_kwargs.get("merge") is True
        data = call_args[0]
        assert "preferences" in data
        assert "updated_at" in data

    def test_upsert_noop_when_db_unavailable(self):
        """_get_db() returns None → upsert() does nothing."""
        store = _make_user_store_no_db()

        with patch("app.core.user_store._get_db", return_value=None):
            store.upsert("test-user-123", preferences=UserPreferences())


# ── UserPreferencesStore.mark_onboarded() ─────────────────────

class TestUserPreferencesStoreMarkOnboarded:
    """Tests for UserPreferencesStore.mark_onboarded()."""

    def test_mark_onboarded_sets_onboarded_at(self):
        """mark_onboarded() writes onboarded_at to Firestore."""
        store, mock_db = _make_user_store()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref
        prefs = UserPreferences(favorite_genres=["Sci-Fi"])

        with patch("app.core.user_store._get_db", return_value=mock_db):
            store.mark_onboarded("test-user-123", preferences=prefs)

        mock_doc_ref.set.assert_called_once()
        call_args, call_kwargs = mock_doc_ref.set.call_args
        data = call_args[0]
        assert "onboarded_at" in data
        assert isinstance(data["onboarded_at"], datetime)
        assert "preferences" in data
        assert call_kwargs.get("merge") is True


# ── UserPreferencesStore.mark_skipped() ───────────────────────

class TestUserPreferencesStoreMarkSkipped:
    """Tests for UserPreferencesStore.mark_skipped()."""

    def test_mark_skipped_sets_onboarded_at_without_preferences(self):
        """mark_skipped() sets onboarded_at but does NOT include a preferences key."""
        store, mock_db = _make_user_store()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref

        with patch("app.core.user_store._get_db", return_value=mock_db):
            store.mark_skipped("test-user-123")

        mock_doc_ref.set.assert_called_once()
        call_args, call_kwargs = mock_doc_ref.set.call_args
        data = call_args[0]
        assert "onboarded_at" in data
        assert isinstance(data["onboarded_at"], datetime)
        assert "preferences" not in data
        assert call_kwargs.get("merge") is True
