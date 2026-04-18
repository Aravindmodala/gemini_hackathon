"""Stateful [[TITLE:...]] marker accumulator for story streams.

Extracts, sanitizes, persists, and emits story titles. Handles both
companion-driven stories (title known upfront) and direct stories
(title parsed from the model's leading [[TITLE: ...]] marker).
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass

from app.core.session_query_service import SessionQueryService
from app.core.store import SessionStore
from app.server.sse import format_sse_event

logger = logging.getLogger("chronicler")

_TITLE_MARKER_PREFIX = "[[TITLE:"
_TITLE_MARKER_SUFFIX = "]]"
_MAX_TITLE_BUFFER_CHARS = 1200


def sanitize_title(raw_title: str) -> str:
    """Trim, normalize spacing, and bound title length."""
    title = re.sub(r"\s+", " ", (raw_title or "").strip())
    if len(title) > 160:
        title = title[:160].rstrip()
    return title


def derive_fallback_title(prompt: str) -> str:
    """Derive a readable title from the user prompt."""
    cleaned = re.sub(r"\s+", " ", (prompt or "").strip())
    if not cleaned:
        return "Untitled Story"

    cleaned = re.sub(
        r"^(write|tell|create|generate)\s+(me\s+)?(a|an)?\s*story\s+(about|on)\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip(" .,:;!-")
    if not cleaned:
        return "Untitled Story"

    snippet = " ".join(cleaned.split()[:8]).strip(" .,:;!-")
    if not snippet:
        return "Untitled Story"
    return snippet[:80].rstrip(" .,:;!-").title() or "Untitled Story"


def _extract_title_marker_from_buffer(buffer: str) -> tuple[str | None, str, bool]:
    """Parse a leading [[TITLE: ...]] marker from buffered prose.

    Returns (title, visible_text, resolved):
      - resolved=False means keep buffering more chunks.
      - title=None with resolved=True means caller should use fallback title.
    """
    if not buffer:
        return None, "", False

    trimmed = buffer.lstrip()
    if not trimmed.startswith("[["):
        return None, buffer, True
    if _TITLE_MARKER_PREFIX.startswith(trimmed):
        return None, "", False
    if not trimmed.startswith(_TITLE_MARKER_PREFIX):
        return None, buffer, True

    marker_end = trimmed.find(_TITLE_MARKER_SUFFIX, len(_TITLE_MARKER_PREFIX))
    if marker_end == -1:
        if len(trimmed) > _MAX_TITLE_BUFFER_CHARS:
            return None, buffer, True
        return None, "", False

    raw_title = trimmed[len(_TITLE_MARKER_PREFIX):marker_end]
    parsed_title = sanitize_title(raw_title)
    visible_text = trimmed[marker_end + len(_TITLE_MARKER_SUFFIX):].lstrip("\r\n")
    return parsed_title or None, visible_text, True


@dataclass(frozen=True)
class TitleFeedResult:
    resolved: bool
    visible_text: str


class TitleExtractor:
    """Stateful [[TITLE:...]] marker accumulator for a single story stream.

    Usage:
        extractor = TitleExtractor(user_prompt="A dark fairy tale")

        # Companion-driven (title known upfront):
        extractor.set_title("The Dark Forest")
        sse = await extractor.persist_and_emit(store, user_id, session_id)

        # Direct stories (title parsed from model output):
        result = extractor.feed(text_chunk)
        if result.resolved:
            sse = await extractor.persist_and_emit(store, user_id, session_id)
    """

    def __init__(self, user_prompt: str) -> None:
        self._user_prompt = user_prompt
        self._explicit = False
        self._buffer = ""
        self._current_title = derive_fallback_title(user_prompt)
        self._emitted = False
        self._sse_payload: str | None = None

    @property
    def title(self) -> str:
        """The resolved title (or fallback from prompt). Always non-empty."""
        return self._current_title

    @property
    def emitted(self) -> bool:
        """Whether the title SSE event has been emitted."""
        return self._emitted

    def set_title(self, title: str) -> None:
        """Set the title directly (companion flow). Skips marker parsing."""
        self._explicit = True
        self._buffer = ""
        self._current_title = sanitize_title(title) or derive_fallback_title(self._user_prompt)

    def feed(self, text_chunk: str) -> TitleFeedResult:
        """Feed a text chunk for title marker detection.

        Returns resolved=False while buffering. When resolved=True,
        visible_text contains the text after the marker (if any).
        """
        if self._explicit:
            return TitleFeedResult(resolved=True, visible_text=text_chunk)

        self._buffer += text_chunk
        marker_title, visible_text, resolved = _extract_title_marker_from_buffer(self._buffer)
        if not resolved:
            return TitleFeedResult(resolved=False, visible_text="")

        self._current_title = marker_title or derive_fallback_title(self._user_prompt)
        self._buffer = ""
        return TitleFeedResult(resolved=True, visible_text=visible_text)

    async def persist_and_emit(
        self,
        store: SessionStore | None,
        user_id: str,
        session_id: str,
        *,
        brief: str = "",
    ) -> str:
        """Persist title to Firestore and return the SSE event payload.

        Idempotent — second call returns the cached payload.
        """
        if self._sse_payload is not None:
            return self._sse_payload

        resolved_title = sanitize_title(self.title) or "Untitled Story"
        if store:
            await asyncio.to_thread(
                SessionQueryService.update_session_title,
                user_id,
                session_id,
                resolved_title,
            )
            logger.info("[Story] session_title_set title=%s", resolved_title)

        self._sse_payload = format_sse_event(
            {"type": "title", "title": resolved_title, "brief": brief}
        )
        self._emitted = True
        return self._sse_payload

    def force_resolve(self) -> str:
        """Force-resolve at stream end if never resolved. Returns leftover text."""
        if self._explicit:
            self._buffer = ""
            return ""

        if not self._buffer:
            return ""

        marker_title, parsed_text, _ = _extract_title_marker_from_buffer(self._buffer)
        self._current_title = marker_title or derive_fallback_title(self._user_prompt)

        leftover = ""
        if parsed_text:
            leftover = parsed_text
        elif self._buffer and not self._buffer.lstrip().startswith("[["):
            leftover = self._buffer

        self._buffer = ""
        return leftover
