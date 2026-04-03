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


def _session_doc_ref(db, user_id: str, session_id: str):
    """Build a Firestore document reference for a session."""
    return (
        db.collection("sessions")
        .document(user_id)
        .collection("conversations")
        .document(session_id)
    )


def _format_interaction_lines(
    interactions: list[dict],
    limit: int | None,
    formatter,
) -> str | None:
    """Format interaction entries into a narrative string.

    Args:
        interactions: List of interaction dicts with 'role' and 'text' keys.
        limit: Max number of interactions to include (None = all).
        formatter: Function that takes a single interaction dict and returns
                   a formatted string, or None to skip that entry.

    Returns:
        Joined formatted string, or None if no interactions produce output.
    """
    if not interactions:
        return None

    if limit:
        interactions = interactions[-limit:]

    lines = []
    for entry in interactions:
        line = formatter(entry)
        if line:
            lines.append(line)

    return "\n".join(lines) if lines else None


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
            self._doc_ref = _session_doc_ref(self._db, self.user_id, self.session_id)

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

    def log_companion_proposal(
        self, title: str, brief: str, emotions: list, genre: str = "", tone: str = ""
    ) -> None:
        """Save the companion's story proposal alongside the session."""
        if not self._doc_ref:
            return

        try:
            self._doc_ref.update({
                "companion_proposal": {
                    "title": title,
                    "brief": brief,
                    "emotions": emotions,
                    "genre": genre,
                    "tone": tone,
                    "proposed_at": datetime.now(timezone.utc).isoformat(),
                },
                "title": title,  # Also update the session title
                "updated_at": datetime.now(timezone.utc),
            })
            logger.info("[Store] Companion proposal saved: %s", title)
        except Exception as e:
            logger.warning("[Store] Failed to save companion proposal: %s", e)

    def get_companion_data(self) -> tuple[str | None, str | None, str | None]:
        """Returns (context_str, proposed_title, proposed_brief) in one Firestore fetch."""
        if not self._doc_ref:
            return None, None, None

        try:
            doc = self._doc_ref.get()
            if not doc.exists:
                return None, None, None

            data = doc.to_dict()
            interactions = data.get("interactions", [])
            proposal = data.get("companion_proposal", {})

            if not interactions and not proposal:
                return None, None, None

            # ── Build context string ──
            lines = []

            if proposal:
                lines.append(f"STORY TITLE: {proposal.get('title', 'Untitled')}")
                lines.append(f"STORY BRIEF: {proposal.get('brief', '')}")
                emotions = proposal.get("emotions", [])
                if emotions:
                    lines.append(f"TRAVELER'S EMOTIONS: {', '.join(emotions)}")
                genre = proposal.get("genre", "")
                if genre:
                    lines.append(f"GENRE: {genre}")
                tone = proposal.get("tone", "")
                if tone:
                    lines.append(f"TONE: {tone}")
                lines.append("")

            if interactions:
                def _companion_fmt(entry):
                    role = entry.get("role", "")
                    text = entry.get("text", "")
                    if role == "user" and text:
                        return f'  Traveler: "{text}"'
                    elif role == "elora" and text:
                        return f'  Elora: "{text}"'
                    return None

                conversation = _format_interaction_lines(interactions, 30, _companion_fmt)
                if conversation:
                    lines.append("COMPANION CONVERSATION:")
                    lines.append(conversation)

            context_str = None
            if lines:
                context = "\n".join(lines)
                context_str = (
                    "\n\n═══════════════════════════════════════════════════════════════\n"
                    "COMPANION CONTEXT — THE TRAVELER'S EMOTIONAL STATE\n"
                    "═══════════════════════════════════════════════════════════════\n\n"
                    "Before this story begins, you (Elora) had a conversation with this "
                    "traveler to understand their mood and what kind of story they need. "
                    "Here is what you learned:\n\n"
                    f"{context}\n\n"
                    "Use this context to shape every aspect of the story — its tone, "
                    "themes, emotional arc, and imagery. The traveler chose this story "
                    "because it resonates with how they feel right now. Honor that.\n"
                    "═══════════════════════════════════════════════════════════════"
                )

            # ── Extract proposal title and brief ──
            proposed_title = proposal.get("title") or None if proposal else None
            proposed_brief = proposal.get("brief", "") if proposal else None

            return context_str, proposed_title, proposed_brief

        except Exception as e:
            logger.warning("[Store] Failed to load companion data: %s", e)
            return None, None, None

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
            self._doc_ref = _session_doc_ref(self._db, self.user_id, self.session_id)
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

            def _session_fmt(entry):
                role = entry.get("role", "")
                if role == "user":
                    return f'The traveler said: "{entry.get("text", "")}"'
                elif role == "elora":
                    return f'You (ELORA) narrated: "{entry.get("text", "")}"'
                elif role == "tool":
                    tool_name = entry.get("name", "unknown")
                    if tool_name == "generate_music":
                        prompt = entry.get("args", {}).get("prompt", "")
                        return f'You scored the scene with music: "{prompt}"'
                return None

            context = _format_interaction_lines(interactions, 30, _session_fmt)
            if not context:
                return None
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

            def _previous_fmt(entry):
                role = entry.get("role", "")
                if role == "user":
                    return f"The traveler said: \"{entry.get('text', '')}\""
                elif role == "elora":
                    return f"You (ELORA) narrated: \"{entry.get('text', '')}\""
                elif role == "tool":
                    tool_name = entry.get("name", "unknown")
                    if tool_name == "generate_music":
                        prompt = entry.get("args", {}).get("prompt", "")
                        return f"You scored the scene with music: \"{prompt}\""
                return None

            context = _format_interaction_lines(interactions, 20, _previous_fmt)
            if not context:
                return None
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

