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
            logger.warning(f"[Store] Firestore unavailable: {e}")
            _db_available = False
            return None
    return _db


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

    def create_session(self) -> str:
        """Create a new session document in Firestore. Returns session_id."""
        self.session_id = uuid.uuid4().hex[:12]

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
                "interactions": [],
            })
        except Exception as e:
            logger.warning(f"[Store] Failed to create session: {e}")
            self._doc_ref = None

        logger.info(
            f"[Store] Session created: {self.user_id}/{self.session_id}"
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
            logger.warning(f"[Store] Failed to log interaction: {e}")

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
            logger.warning(f"[Store] Failed to log tool call: {e}")

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
                f"[Store] Session ended: {self.user_id}/{self.session_id}"
            )
        except Exception as e:
            logger.warning(f"[Store] Failed to end session: {e}")

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
            logger.warning(f"[Store] Failed to load previous context: {e}")
            return None
