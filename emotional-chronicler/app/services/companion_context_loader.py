"""Loads companion conversation context from Firestore to enrich story prompts."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.core.store import SessionStore

logger = logging.getLogger("chronicler")


@dataclass
class CompanionContext:
    """Result of loading companion session context."""

    applied: bool
    prompt_text: str
    proposed_title: str | None
    proposed_brief: str | None

    @staticmethod
    def empty(original_prompt: str) -> CompanionContext:
        return CompanionContext(
            applied=False,
            prompt_text=original_prompt,
            proposed_title=None,
            proposed_brief=None,
        )


class CompanionContextLoader:
    """Loads companion conversation context from Firestore to enrich story prompts."""

    async def load(
        self,
        *,
        user_id: str,
        companion_session_id: str | None,
        original_prompt: str,
        is_authenticated: bool,
    ) -> CompanionContext:
        """Load companion context if available.

        Returns CompanionContext.empty() when companion_session_id is None,
        the user is not authenticated, or the session has no usable context.
        """
        if not companion_session_id or not is_authenticated:
            return CompanionContext.empty(original_prompt)

        companion_store = SessionStore(user_id)
        resumed = await asyncio.to_thread(
            companion_store.resume_session, companion_session_id
        )
        if not resumed:
            return CompanionContext.empty(original_prompt)

        companion_context, proposed_title, proposed_brief = await asyncio.to_thread(
            companion_store.get_companion_data
        )
        if not companion_context:
            return CompanionContext(
                applied=False,
                prompt_text=original_prompt,
                proposed_title=proposed_title,
                proposed_brief=proposed_brief,
            )

        prompt_text = (
            f"{companion_context}\n\n"
            "The traveler is ready. Begin the story now.\n"
        )
        if proposed_title:
            prompt_text += (
                f'The story title is already fixed as "{proposed_title}". '
                "Do not emit a [[TITLE: ...]] marker. Begin directly with story prose.\n"
            )
        prompt_text += f"\nOriginal prompt: {original_prompt}"
        logger.info(
            "[Story] companion_context_loaded session_id=%s",
            companion_session_id,
        )
        return CompanionContext(
            applied=True,
            prompt_text=prompt_text,
            proposed_title=proposed_title,
            proposed_brief=proposed_brief,
        )
