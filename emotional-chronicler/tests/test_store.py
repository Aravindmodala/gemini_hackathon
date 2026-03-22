"""Unit tests for app/core/store.py — SessionStore and Firestore helpers."""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from datetime import datetime, timezone


# ── Helpers ───────────────────────────────────────────────────

def _make_store(user_id="test-user-123", db=None):
    """Create a SessionStore with a mocked Firestore client."""
    with patch("app.core.store._get_db") as mock_get_db:
        mock_get_db.return_value = db
        from app.core.store import SessionStore
        store = SessionStore(user_id)
    return store


def _make_store_with_db(user_id="test-user-123"):
    """Create a SessionStore with a fully mocked Firestore chain."""
    mock_db = MagicMock()
    store = _make_store(user_id, db=mock_db)
    return store, mock_db


# ── create_session ────────────────────────────────────────────

class TestCreateSession:
    """Tests for SessionStore.create_session()."""

    def test_create_session_creates_document_with_correct_fields(self):
        """create_session() sets up Firestore doc with expected fields."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

        session_id = store.create_session()

        assert session_id is not None
        assert len(session_id) == 12
        mock_doc_ref.set.assert_called_once()
        call_args = mock_doc_ref.set.call_args[0][0]
        assert call_args["status"] == "active"
        assert call_args["title"] == "Untitled Story"
        assert call_args["interactions"] == []
        assert "created_at" in call_args
        assert "updated_at" in call_args

    def test_create_session_with_custom_title(self):
        """create_session(title=...) uses the custom title."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

        session_id = store.create_session(title="My Epic Tale")

        call_args = mock_doc_ref.set.call_args[0][0]
        assert call_args["title"] == "My Epic Tale"

    def test_create_session_when_firestore_unavailable_returns_session_id(self):
        """Firestore unavailable → still returns session_id, doesn't persist."""
        store = _make_store(db=None)

        session_id = store.create_session()

        assert session_id is not None
        assert len(session_id) == 12
        assert store.session_id == session_id


# ── log_interaction ───────────────────────────────────────────

class TestLogInteraction:
    """Tests for SessionStore.log_interaction()."""

    def test_log_interaction_appends_to_interactions_array(self):
        """log_interaction() updates Firestore with ArrayUnion."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        store.create_session()

        with patch("app.core.store.firestore") as mock_firestore:
            mock_firestore.ArrayUnion = MagicMock(return_value="array_union_sentinel")
            store.log_interaction("user", "Tell me a story")

            mock_doc_ref.update.assert_called_once()
            call_args = mock_doc_ref.update.call_args[0][0]
            assert "interactions" in call_args
            assert "updated_at" in call_args

    def test_log_interaction_with_empty_text_skips(self):
        """Empty text → no Firestore update."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        store.create_session()

        store.log_interaction("user", "   ")

        # update should not be called for empty text
        mock_doc_ref.update.assert_not_called()

    def test_log_interaction_without_doc_ref_is_noop(self):
        """No doc_ref → silently skips."""
        store = _make_store(db=None)
        store.create_session()

        # Should not raise
        store.log_interaction("user", "Hello")


# ── log_tool_call ─────────────────────────────────────────────

class TestLogToolCall:
    """Tests for SessionStore.log_tool_call()."""

    def test_log_tool_call_appends_tool_record(self):
        """log_tool_call() updates Firestore with tool entry."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        store.create_session()

        with patch("app.core.store.firestore") as mock_firestore:
            mock_firestore.ArrayUnion = MagicMock(return_value="array_union_sentinel")
            store.log_tool_call("generate_music", {"prompt": "epic orchestral"})

            mock_doc_ref.update.assert_called_once()
            call_args = mock_doc_ref.update.call_args[0][0]
            assert "interactions" in call_args

    def test_log_tool_call_without_doc_ref_is_noop(self):
        """No doc_ref → silently skips."""
        store = _make_store(db=None)
        store.create_session()

        # Should not raise
        store.log_tool_call("generate_music", {"prompt": "test"})


# ── end_session ───────────────────────────────────────────────

class TestEndSession:
    """Tests for SessionStore.end_session()."""

    def test_end_session_updates_status_to_ended(self):
        """end_session() sets status='ended' in Firestore."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        store.create_session()

        store.end_session()

        mock_doc_ref.update.assert_called_once()
        call_args = mock_doc_ref.update.call_args[0][0]
        assert call_args["status"] == "ended"
        assert "updated_at" in call_args

    def test_end_session_without_doc_ref_is_noop(self):
        """No doc_ref → silently skips."""
        store = _make_store(db=None)
        store.create_session()

        # Should not raise
        store.end_session()


# ── _init_doc_ref ─────────────────────────────────────────────

class TestInitDocRef:
    """Tests for SessionStore._init_doc_ref()."""

    def test_init_doc_ref_sets_up_document_reference(self):
        """_init_doc_ref() creates the Firestore doc reference chain."""
        store, mock_db = _make_store_with_db()
        store.session_id = "test-session-abc"

        store._init_doc_ref()

        mock_db.collection.assert_called_with("sessions")
        mock_db.collection.return_value.document.assert_called_with("test-user-123")

    def test_init_doc_ref_without_db_is_noop(self):
        """No db → silently skips."""
        store = _make_store(db=None)
        store.session_id = "test-session-abc"

        store._init_doc_ref()

        assert store._doc_ref is None

    def test_init_doc_ref_without_session_id_is_noop(self):
        """No session_id → silently skips."""
        store, mock_db = _make_store_with_db()
        store.session_id = None

        store._init_doc_ref()

        assert store._doc_ref is None


# ── get_session_context ───────────────────────────────────────

class TestGetSessionContext:
    """Tests for SessionStore.get_session_context()."""

    def test_get_session_context_returns_formatted_context(self):
        """With interactions → returns formatted narrative context."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        store.create_session()

        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "interactions": [
                {"role": "user", "text": "Tell me a story"},
                {"role": "elora", "text": "Once upon a time..."},
            ]
        }
        mock_doc_ref.get.return_value = mock_doc

        result = store.get_session_context()

        assert result is not None
        assert "MEMORY" in result
        assert 'The traveler said: "Tell me a story"' in result
        assert 'You (ELORA) narrated: "Once upon a time..."' in result

    def test_get_session_context_with_no_interactions_returns_none(self):
        """No interactions → returns None."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        store.create_session()

        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"interactions": []}
        mock_doc_ref.get.return_value = mock_doc

        result = store.get_session_context()

        assert result is None

    def test_get_session_context_without_doc_ref_returns_none(self):
        """No doc_ref → returns None."""
        store = _make_store(db=None)
        store.create_session()

        result = store.get_session_context()

        assert result is None

    def test_get_session_context_with_nonexistent_doc_returns_none(self):
        """Document doesn't exist → returns None."""
        store, mock_db = _make_store_with_db()
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        store.create_session()

        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_doc_ref.get.return_value = mock_doc

        result = store.get_session_context()

        assert result is None


# ── get_previous_context ──────────────────────────────────────

class TestGetPreviousContext:
    """Tests for SessionStore.get_previous_context()."""

    def test_get_previous_context_returns_formatted_memory(self):
        """Previous ended session → returns formatted memory."""
        store, mock_db = _make_store_with_db()

        mock_query = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value = MagicMock()
        mock_conversations_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        mock_conversations_ref.where.return_value.order_by.return_value.limit.return_value = mock_query

        mock_doc = MagicMock()
        mock_doc.to_dict.return_value = {
            "interactions": [
                {"role": "user", "text": "Tell me about dragons"},
                {"role": "elora", "text": "Ah, the ancient wyrms..."},
            ]
        }
        mock_query.stream.return_value = [mock_doc]

        result = store.get_previous_context()

        assert result is not None
        assert "MEMORY" in result
        assert "PREVIOUS SESSION" in result
        assert 'The traveler said: "Tell me about dragons"' in result

    def test_get_previous_context_without_db_returns_none(self):
        """No Firestore → returns None."""
        store = _make_store(db=None)

        result = store.get_previous_context()

        assert result is None

    def test_get_previous_context_no_previous_sessions_returns_none(self):
        """No ended sessions → returns None."""
        store, mock_db = _make_store_with_db()

        mock_query = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value = MagicMock()
        mock_conversations_ref = mock_db.collection.return_value.document.return_value.collection.return_value
        mock_conversations_ref.where.return_value.order_by.return_value.limit.return_value = mock_query
        mock_query.stream.return_value = []

        result = store.get_previous_context()

        assert result is None


# ── Static methods: list_sessions ─────────────────────────────

class TestListSessions:
    """Tests for SessionStore.list_sessions()."""

    def test_list_sessions_returns_formatted_session_list(self):
        """Returns list of session dicts with expected fields."""
        now = datetime.now(timezone.utc)

        with patch("app.core.store._get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_get_db.return_value = mock_db

            mock_query = MagicMock()
            mock_db.collection.return_value.document.return_value.collection.return_value.order_by.return_value = mock_query

            mock_doc = MagicMock()
            mock_doc.id = "session-abc"
            mock_doc.to_dict.return_value = {
                "title": "Dragon Tale",
                "status": "ended",
                "created_at": now,
                "updated_at": now,
                "interactions": [
                    {"role": "user", "text": "Hello"},
                    {"role": "elora", "text": "Welcome, traveler"},
                ],
            }
            mock_query.limit.return_value.stream.return_value = [mock_doc]

            from app.core.store import SessionStore
            sessions, next_cursor = SessionStore.list_sessions("test-user-123")

            assert len(sessions) == 1
            assert sessions[0]["session_id"] == "session-abc"
            assert sessions[0]["title"] == "Dragon Tale"
            assert sessions[0]["status"] == "ended"
            assert sessions[0]["interaction_count"] == 2
            assert sessions[0]["preview"] == "Welcome, traveler"
            assert next_cursor is None

    def test_list_sessions_with_no_db_returns_empty_list(self):
        """No Firestore → returns ([], None) tuple."""
        with patch("app.core.store._get_db") as mock_get_db:
            mock_get_db.return_value = None

            from app.core.store import SessionStore
            sessions, next_cursor = SessionStore.list_sessions("test-user-123")

            assert sessions == []
            assert next_cursor is None


# ── Static methods: get_session ───────────────────────────────

class TestGetSession:
    """Tests for SessionStore.get_session()."""

    def test_get_session_returns_session_data(self):
        """Existing session → returns session dict with interactions."""
        now = datetime.now(timezone.utc)

        with patch("app.core.store._get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_get_db.return_value = mock_db

            mock_doc_ref = MagicMock()
            mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

            mock_doc = MagicMock()
            mock_doc.exists = True
            mock_doc.id = "session-xyz"
            mock_doc.to_dict.return_value = {
                "title": "My Story",
                "status": "active",
                "created_at": now,
                "updated_at": now,
                "interactions": [{"role": "user", "text": "Hi"}],
            }
            mock_doc_ref.get.return_value = mock_doc

            from app.core.store import SessionStore
            result = SessionStore.get_session("test-user-123", "session-xyz")

            assert result is not None
            assert result["session_id"] == "session-xyz"
            assert result["title"] == "My Story"
            assert len(result["interactions"]) == 1

    def test_get_session_with_nonexistent_session_returns_none(self):
        """Non-existent session → returns None."""
        with patch("app.core.store._get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_get_db.return_value = mock_db

            mock_doc_ref = MagicMock()
            mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

            mock_doc = MagicMock()
            mock_doc.exists = False
            mock_doc_ref.get.return_value = mock_doc

            from app.core.store import SessionStore
            result = SessionStore.get_session("test-user-123", "nonexistent")

            assert result is None

    def test_get_session_with_no_db_returns_none(self):
        """No Firestore → returns None."""
        with patch("app.core.store._get_db") as mock_get_db:
            mock_get_db.return_value = None

            from app.core.store import SessionStore
            result = SessionStore.get_session("test-user-123", "any-id")

            assert result is None


# ── Static methods: delete_session ────────────────────────────

class TestDeleteSession:
    """Tests for SessionStore.delete_session()."""

    def test_delete_session_deletes_document(self):
        """Successful delete → returns True."""
        with patch("app.core.store._get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_get_db.return_value = mock_db

            mock_doc_ref = MagicMock()
            mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

            from app.core.store import SessionStore
            result = SessionStore.delete_session("test-user-123", "session-abc")

            assert result is True
            mock_doc_ref.delete.assert_called_once()

    def test_delete_session_with_no_db_returns_false(self):
        """No Firestore → returns False."""
        with patch("app.core.store._get_db") as mock_get_db:
            mock_get_db.return_value = None

            from app.core.store import SessionStore
            result = SessionStore.delete_session("test-user-123", "any-id")

            assert result is False


# ── Static methods: update_session_title ──────────────────────

class TestUpdateSessionTitle:
    """Tests for SessionStore.update_session_title()."""

    def test_update_session_title_updates_title(self):
        """Successful update → returns True."""
        with patch("app.core.store._get_db") as mock_get_db:
            mock_db = MagicMock()
            mock_get_db.return_value = mock_db

            mock_doc_ref = MagicMock()
            mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref

            from app.core.store import SessionStore
            result = SessionStore.update_session_title(
                "test-user-123", "session-abc", "New Title"
            )

            assert result is True
            mock_doc_ref.update.assert_called_once()
            call_args = mock_doc_ref.update.call_args[0][0]
            assert call_args["title"] == "New Title"

    def test_update_session_title_with_no_db_returns_false(self):
        """No Firestore → returns False."""
        with patch("app.core.store._get_db") as mock_get_db:
            mock_get_db.return_value = None

            from app.core.store import SessionStore
            result = SessionStore.update_session_title(
                "test-user-123", "any-id", "Title"
            )

            assert result is False


# ── _get_preview ──────────────────────────────────────────────

class TestGetPreview:
    """Tests for _get_preview() helper."""

    def test_get_preview_extracts_preview_text(self):
        """Returns last meaningful interaction text."""
        from app.core.store import _get_preview

        interactions = [
            {"role": "user", "text": "Hello"},
            {"role": "elora", "text": "Welcome, brave traveler!"},
        ]
        result = _get_preview(interactions)
        assert result == "Welcome, brave traveler!"

    def test_get_preview_truncates_long_text(self):
        """Long text → truncated with ellipsis."""
        from app.core.store import _get_preview

        long_text = "A" * 150
        interactions = [{"role": "elora", "text": long_text}]
        result = _get_preview(interactions)
        assert len(result) == 103  # 100 chars + "..."
        assert result.endswith("...")

    def test_get_preview_with_empty_interactions_returns_default(self):
        """No interactions → returns default text."""
        from app.core.store import _get_preview

        result = _get_preview([])
        assert result == "New conversation"

    def test_get_preview_skips_tool_entries(self):
        """Tool entries are skipped, returns last user/elora text."""
        from app.core.store import _get_preview

        interactions = [
            {"role": "user", "text": "Play music"},
            {"role": "tool", "name": "generate_music", "text": ""},
        ]
        result = _get_preview(interactions)
        assert result == "Play music"
