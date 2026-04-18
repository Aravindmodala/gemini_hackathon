"""
ADK session lifecycle management.

Encapsulates the get-or-create pattern for ADK session service (currently
VertexAiSessionService), shared by both the story and companion route handlers.
"""

import logging

from google.adk.runners import Runner

try:
    from google.api_core.exceptions import NotFound as _NotFound
except ImportError:
    _NotFound = Exception  # type: ignore[assignment,misc]

logger = logging.getLogger("chronicler")


class ADKSessionManager:
    """Manages ADK session lifecycle."""

    def __init__(self, runner: Runner, app_name: str):
        self._runner = runner
        self._app_name = app_name

    async def ensure_session_exists(self, user_id: str, session_id: str) -> None:
        """Get or create an ADK session.

        Checks whether a session already exists for the given user_id and
        session_id.  If not, creates one so the runner can stream events.

        VertexAiSessionService raises NotFound (HTTP 404) for unknown sessions
        rather than returning None, so both outcomes are handled.
        """
        existing = None
        try:
            existing = await self._runner.session_service.get_session(
                app_name=self._app_name,
                user_id=user_id,
                session_id=session_id,
            )
        except _NotFound:
            pass

        if not existing:
            logger.info(
                "[ADK] creating new session user_id=%s session_id=%s",
                user_id,
                session_id,
            )
            await self._runner.session_service.create_session(
                app_name=self._app_name,
                user_id=user_id,
                session_id=session_id,
            )
