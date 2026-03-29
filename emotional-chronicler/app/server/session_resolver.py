"""
Session identity resolution for route handlers.

Extracts the common pattern of determining user_id, session_id, and
SessionStore from auth state and request parameters — shared by both
the story and companion routes.
"""

import asyncio
import logging
import uuid

from app.core.store import SessionStore

logger = logging.getLogger("chronicler")


class SessionResolver:
    """Resolves session identity from auth state and request parameters."""

    async def resolve(
        self,
        auth_user: dict | None,
        requested_session_id: str | None,
        session_title: str = "Untitled Story",
        fallback_user_id: str = "anonymous",
    ) -> tuple[str, str, SessionStore | None]:
        """
        Determine user_id, session_id, and optional SessionStore.

        Args:
            auth_user: Decoded Firebase token dict (with "uid" key), or None.
            requested_session_id: Client-supplied session_id, if any.
            session_title: Title for newly created Firestore sessions.
            fallback_user_id: user_id to use when auth_user is None.

        Returns:
            (user_id, session_id, store) where store is None for anonymous users.
        """
        if auth_user:
            user_id = auth_user["uid"]
            store = SessionStore(user_id)
            if requested_session_id:
                resumed = await asyncio.to_thread(
                    store.resume_session, requested_session_id
                )
                if resumed:
                    session_id = requested_session_id
                    logger.info("[Session] resumed session_id=%s", session_id)
                else:
                    session_id = await asyncio.to_thread(
                        store.create_session, session_title
                    )
                    logger.info(
                        "[Session] created new session_id=%s (resume failed)",
                        session_id,
                    )
            else:
                session_id = await asyncio.to_thread(
                    store.create_session, session_title
                )
                logger.info("[Session] created new session_id=%s", session_id)
        else:
            user_id = fallback_user_id
            session_id = requested_session_id or uuid.uuid4().hex
            store = None
            logger.info("[Session] anonymous user session_id=%s", session_id)

        return user_id, session_id, store
