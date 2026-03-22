
"""
ADK Elora agent — Creative Storyteller.

Defines the Google ADK Agent and Runner for illustrated story generation.
The agent uses gemini-3.1-pro-preview as its reasoning model and has two tools:
  - generate_image  → Imagen 4 scene illustrations
  - generate_music  → Lyria 2 background music tracks

Usage:
    from app.core.agent import runner, APP_NAME
    async for event in runner.run_async(user_id=..., session_id=..., new_message=...):
        ...
"""

import logging

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from app.config import STORY_MODEL
from app.prompts import ELORA_SYSTEM_PROMPT
from app.tools.imagen import generate_image
from app.tools.lyria import generate_music

logger = logging.getLogger("chronicler")

APP_NAME = "emotional_chronicler"

# ── Agent definition ──────────────────────────────────────────────────────────

elora_agent = Agent(
    name="elora",
    model=STORY_MODEL,
    description=(
        "Elora — a master author and storyteller who writes richly illustrated stories. "
        "She generates literary prose narration and uses Imagen 4 to create scene "
        "illustrations and Lyria 2 to compose atmospheric background music."
    ),
    instruction=ELORA_SYSTEM_PROMPT,
    tools=[generate_image, generate_music],
)

# ── Runner + session service ──────────────────────────────────────────────────
# InMemorySessionService is used here. For production, swap with a
# Firestore-backed session service to persist across restarts.

_session_service = InMemorySessionService()

runner = Runner(
    agent=elora_agent,
    app_name=APP_NAME,
    session_service=_session_service,
)

logger.info(f"[Agent] Elora ADK agent ready — model: {STORY_MODEL}")
