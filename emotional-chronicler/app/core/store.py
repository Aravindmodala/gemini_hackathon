import logging
import uuid
from datetime import datetime, timezone

from google.cloud import firestore

from app.config import PROJECT_ID

logger = logging.getLogger("chronicler")

# Firestore client (reused across sessions)
_db = None
_db_available = True


def _get_db() -> firestore.Client | None:
    """Lazy-initialize the Firestore client. Returns None if unavailable."""
    global _db, _db_available
    if not _db_available:
        return None
    if _db is None:
        try:
            _db = firestore.Client(project=PROJECT_ID)
            logger.info("[Store] Firestore client initialized")
        except Exception as e:
            logger.warning("[Store] Firestore unavailable: %s", e)
            _db_available = False
            return None
    return _db


def _safe_iso(val) -> str | None:
    """Safely convert a Firestore timestamp to ISO 8601 string."""
    if val is None:
        return None
    try:
        return val.isoformat()
    except AttributeError:
        return str(val)


def _get_preview(interactions: list) -> str:
    """Get a short preview from the last meaningful interaction."""
    for entry in reversed(interactions):
        text = entry.get("text", "")
        if text and entry.get("role") in ("user", "elora"):
            return text[:100] + ("..." if len(text) > 100 else "")
    return "New conversation"


class SessionStore:
    """
    Manages a single conversation's lifecycle in Firestore.

    Usage:
        store = SessionStore(user_id="abc123")
        store.create_session()
        store.log_interaction("user", "Tell me a story")
        store.log_interaction("elora", "Ah, welcome traveler...")
        store.log_tool_call("generate_music", {"prompt": "epic orchestral"})
        store.end_session()
    """

    def __init__(self, user_id: str):
        self.user_id = user_id
        self.session_id: str | None = None
        self._doc_ref = None
        self._db = _get_db()

    @property
    def available(self) -> bool:
        """Whether Firestore is available for logging."""
        return self._db is not None

    def create_session(self, title: str = "Untitled Story") -> str:
        """Create a new session document in Firestore. Returns session_id."""
        self.session_id = uuid.uuid4().hex

        if not self._db:
            logger.warning("[Store] Firestore unavailable — session not persisted")
            return self.session_id

        now = datetime.now(timezone.utc)

        try:
            self._doc_ref = (
                self._db.collection("sessions")
                .document(self.user_id)
                .collection("conversations")
                .document(self.session_id)
            )

            self._doc_ref.set({
                "created_at": now,
                "updated_at": now,
                "status": "active",
                "title": title,
                "interactions": [],
            })
        except Exception as e:
            logger.warning("[Store] Failed to create session: %s", e)
            self._doc_ref = None

        logger.info(
            "[Store] Session created: %s/%s", self.user_id, self.session_id
        )
        return self.session_id

    def log_interaction(self, role: str, text: str) -> None:
        """
        Append a user or ELORA interaction to the session log.

        Args:
            role: "user" or "elora"
            text: The transcribed speech or narration text
        """
        if not self._doc_ref or not text.strip():
            return

        entry = {
            "role": role,
            "text": text.strip(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            self._doc_ref.update({
                "interactions": firestore.ArrayUnion([entry]),
                "updated_at": datetime.now(timezone.utc),
            })
        except Exception as e:
            logger.warning("[Store] Failed to log interaction: %s", e)

    def log_tool_call(self, name: str, args: dict) -> None:
        """Append a tool call record to the session log."""
        if not self._doc_ref:
            return

        entry = {
            "role": "tool",
            "name": name,
            "args": args,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            self._doc_ref.update({
                "interactions": firestore.ArrayUnion([entry]),
                "updated_at": datetime.now(timezone.utc),
            })
        except Exception as e:
            logger.warning("[Store] Failed to log tool call: %s", e)

    def end_session(self) -> None:
        """Mark the session as ended."""
        if not self._doc_ref:
            return

        try:
            self._doc_ref.update({
                "status": "ended",
                "updated_at": datetime.now(timezone.utc),
            })
            logger.info(
                "[Store] Session ended: %s/%s", self.user_id, self.session_id
            )
        except Exception as e:
            logger.warning("[Store] Failed to end session: %s", e)

    def resume_session(self, session_id: str) -> bool:
        """Attach to an existing session. Returns True if it exists in Firestore.

        Args:
            session_id: The session ID to resume.

        Returns:
            True if the session document exists and was attached successfully.
        """
        self.session_id = session_id
        self._init_doc_ref()
        return self._verify_session_exists()

    def _init_doc_ref(self) -> None:
        """Initialize the Firestore document reference for an existing session."""
        if not self._db or not self.session_id:
            return
        try:
            self._doc_ref = (
                self._db.collection("sessions")
                .document(self.user_id)
                .collection("conversations")
                .document(self.session_id)
            )
        except Exception as e:
            logger.warning("[Store] Failed to init doc ref: %s", e)
            self._doc_ref = None

    def _verify_session_exists(self) -> bool:
        """Check whether the current session document exists in Firestore."""
        if not self._doc_ref:
            return False
        try:
            doc = self._doc_ref.get()
            return doc.exists
        except Exception as e:
            logger.warning("[Store] Failed to verify session: %s", e)
            return False

    def get_session_context(self) -> str | None:
        """
        Load interactions from the CURRENT session for resume context.

        Used when a user reconnects to an existing active session.
        Returns formatted narrative context or None.
        """
        if not self._doc_ref:
            return None
        try:
            doc = self._doc_ref.get()
            if not doc.exists:
                return None
            data = doc.to_dict()
            interactions = data.get("interactions", [])
            if not interactions:
                return None

            # Format same as get_previous_context but for current session
            lines = []
            for entry in interactions[-30:]:  # Last 30 interactions
                role = entry.get("role", "")
                if role == "user":
                    lines.append(f'The traveler said: "{entry.get("text", "")}"')
                elif role == "elora":
                    lines.append(f'You (ELORA) narrated: "{entry.get("text", "")}"')
                elif role == "tool":
                    tool_name = entry.get("name", "unknown")
                    if tool_name == "generate_music":
                        prompt = entry.get("args", {}).get("prompt", "")
                        lines.append(f'You scored the scene with music: "{prompt}"')

            if not lines:
                return None

            context = "\n".join(lines)
            return (
                f"\n\n═══════════════════════════════════════════════════════════════\n"
                f"MEMORY — CONTINUING YOUR STORY WITH THIS TRAVELER\n"
                f"═══════════════════════════════════════════════════════════════\n\n"
                f"You are continuing a story with this traveler. Here is what happened "
                f"so far in this session:\n\n{context}\n\n"
                f"Continue naturally from where you left off. The traveler has returned "
                f"to hear more of the story. Welcome them back briefly and pick up "
                f"the narrative thread.\n"
                f"═══════════════════════════════════════════════════════════════"
            )
        except Exception as e:
            logger.warning("[Store] Failed to load session context: %s", e)
            return None

    def get_previous_context(self) -> str | None:
        """
        Load the most recent ENDED session for this user and format
        it as narrative context for ELORA's system prompt.

        Returns None if no previous session exists.
        """
        if not self._db:
            return None

        try:
            conversations_ref = (
                self._db.collection("sessions")
                .document(self.user_id)
                .collection("conversations")
            )

            # Get the most recent ended session
            query = (
                conversations_ref
                .where("status", "==", "ended")
                .order_by("updated_at", direction=firestore.Query.DESCENDING)
                .limit(1)
            )

            docs = list(query.stream())
            if not docs:
                return None

            session_data = docs[0].to_dict()
            interactions = session_data.get("interactions", [])

            if not interactions:
                return None

            # Build a narrative summary of the previous session
            lines = []
            for entry in interactions[-20:]:  # Last 20 interactions max
                role = entry.get("role", "")
                if role == "user":
                    lines.append(f"The traveler said: \"{entry.get('text', '')}\"")
                elif role == "elora":
                    lines.append(f"You (ELORA) narrated: \"{entry.get('text', '')}\"")
                elif role == "tool":
                    tool_name = entry.get("name", "unknown")
                    if tool_name == "generate_music":
                        prompt = entry.get("args", {}).get("prompt", "")
                        lines.append(f"You scored the scene with music: \"{prompt}\"")

            if not lines:
                return None

            context = "\n".join(lines)
            return (
                f"\n\n═══════════════════════════════════════════════════════════════\n"
                f"MEMORY — YOUR PREVIOUS SESSION WITH THIS TRAVELER\n"
                f"═══════════════════════════════════════════════════════════════\n\n"
                f"This traveler has visited your hearth before. Here is what happened "
                f"in your last encounter:\n\n{context}\n\n"
                f"Use this memory naturally. Welcome them back warmly. Reference "
                f"their previous story if they wish to continue, but don't force it — "
                f"they may want a fresh tale. Let them choose.\n"
                f"═══════════════════════════════════════════════════════════════"
            )

        except Exception as e:
            logger.warning("[Store] Failed to load previous context: %s", e)
            return None

    # ── Static query methods (for REST API) ───────────────────

    @staticmethod
    def list_sessions(user_id: str, limit: int = 20, cursor: str | None = None) -> tuple:
        """List sessions for a user with cursor-based pagination.

        Args:
            user_id: The Firebase UID of the user.
            limit: Maximum number of sessions to return (1–100).
            cursor: Opaque cursor — the session_id of the last item from the previous page.

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

            # Apply cursor if provided
            if cursor:
                cursor_doc = conversations_ref.document(cursor).get()
                if cursor_doc.exists:
                    query = query.start_after(cursor_doc)

            # Fetch limit+1 to detect whether a next page exists
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
            logger.warning("[Store] Failed to list sessions: %s", e)
            return [], None

    @staticmethod
    def get_session(user_id: str, session_id: str) -> dict | None:
        """Get a single session with all interactions."""
        db = _get_db()
        if not db:
            return None
        try:
            doc_ref = (
                db.collection("sessions")
                .document(user_id)
                .collection("conversations")
                .document(session_id)
            )
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
            logger.warning("[Store] Failed to get session: %s", e)
            return None

    @staticmethod
    def delete_session(user_id: str, session_id: str) -> bool:
        """Delete a session document."""
        db = _get_db()
        if not db:
            return False
        try:
            doc_ref = (
                db.collection("sessions")
                .document(user_id)
                .collection("conversations")
                .document(session_id)
            )
            doc_ref.delete()
            logger.info("[Store] Session deleted: %s/%s", user_id, session_id)
            return True
        except Exception as e:
            logger.warning("[Store] Failed to delete session: %s", e)
            return False

    @staticmethod
    def update_session_title(user_id: str, session_id: str, title: str) -> bool:
        """Update a session's title."""
        db = _get_db()
        if not db:
            return False
        try:
            doc_ref = (
                db.collection("sessions")
                .document(user_id)
                .collection("conversations")
                .document(session_id)
            )
            doc_ref.update({"title": title, "updated_at": datetime.now(timezone.utc)})
            return True
        except Exception as e:
            logger.warning("[Store] Failed to update title: %s", e)
            return False
