"""Read-model service for session REST API queries.

Handles list/get/delete/update operations on session documents in Firestore.
These are stateless operations that don't require a SessionStore instance.
"""

import logging
from datetime import datetime, timezone

from google.cloud import firestore

from app.core.store import _get_db, _safe_iso, _session_doc_ref, _get_preview

logger = logging.getLogger("chronicler")


class SessionQueryService:
    """Stateless service for session CRUD queries used by session_routes.py."""

    @staticmethod
    def list_sessions(
        user_id: str, limit: int = 20, cursor: str | None = None
    ) -> tuple[list[dict], str | None]:
        """List sessions for a user with cursor-based pagination.

        Args:
            user_id: The Firebase UID of the user.
            limit: Maximum number of sessions to return (1-100).
            cursor: Opaque cursor - the session_id of the last item from the previous page.

        Returns:
            A (sessions, next_cursor) tuple. next_cursor is None when no more pages exist.
        """
        db = _get_db()
        if not db:
            return [], None
        try:
            conversations_ref = (
                db.collection("sessions")
                .document(user_id)
                .collection("conversations")
            )
            query = conversations_ref.order_by(
                "updated_at", direction=firestore.Query.DESCENDING
            )

            if cursor:
                cursor_doc = conversations_ref.document(cursor).get()
                if cursor_doc.exists:
                    query = query.start_after(cursor_doc)

            docs = list(query.limit(limit + 1).stream())

            has_next = len(docs) > limit
            page_docs = docs[:limit]

            sessions = []
            for doc in page_docs:
                data = doc.to_dict()
                sessions.append({
                    "session_id": doc.id,
                    "title": data.get("title", "Untitled Story"),
                    "status": data.get("status", "unknown"),
                    "created_at": _safe_iso(data.get("created_at")),
                    "updated_at": _safe_iso(data.get("updated_at")),
                    "interaction_count": len(data.get("interactions", [])),
                    "preview": _get_preview(data.get("interactions", [])),
                })

            next_cursor = page_docs[-1].id if has_next and page_docs else None
            return sessions, next_cursor

        except Exception as e:
            logger.warning("[SessionQuery] Failed to list sessions: %s", e)
            return [], None

    @staticmethod
    def get_session(user_id: str, session_id: str) -> dict | None:
        """Get a single session with all interactions."""
        db = _get_db()
        if not db:
            return None
        try:
            doc_ref = _session_doc_ref(db, user_id, session_id)
            doc = doc_ref.get()
            if not doc.exists:
                return None
            data = doc.to_dict()
            return {
                "session_id": doc.id,
                "title": data.get("title", "Untitled Story"),
                "status": data.get("status", "unknown"),
                "created_at": _safe_iso(data.get("created_at")),
                "updated_at": _safe_iso(data.get("updated_at")),
                "interactions": data.get("interactions", []),
            }
        except Exception as e:
            logger.warning("[SessionQuery] Failed to get session: %s", e)
            return None

    @staticmethod
    def delete_session(user_id: str, session_id: str) -> bool:
        """Delete a session document."""
        db = _get_db()
        if not db:
            return False
        try:
            doc_ref = _session_doc_ref(db, user_id, session_id)
            doc_ref.delete()
            logger.info("[SessionQuery] Session deleted: %s/%s", user_id, session_id)
            return True
        except Exception as e:
            logger.warning("[SessionQuery] Failed to delete session: %s", e)
            return False

    @staticmethod
    def update_session_title(user_id: str, session_id: str, title: str) -> bool:
        """Update a session's title."""
        db = _get_db()
        if not db:
            return False
        try:
            doc_ref = _session_doc_ref(db, user_id, session_id)
            doc_ref.update({"title": title, "updated_at": datetime.now(timezone.utc)})
            return True
        except Exception as e:
            logger.warning("[SessionQuery] Failed to update title: %s", e)
            return False
