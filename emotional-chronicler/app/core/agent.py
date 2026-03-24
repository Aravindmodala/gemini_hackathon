
"""
ADK Elora agent — Creative Storyteller.

Defines two ADK Agents:
  1. elora_agent      (Gemini 3.1 Pro) — story generation with image + music tools
  2. companion_agent  (Gemini 2.0 Flash) — pre-story conversation to capture mood/emotions

The companion captures context BEFORE story generation, then all its interactions
are forwarded to elora_agent so stories are emotionally tailored.
"""

import logging

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from app.config import STORY_MODEL, COMPANION_MODEL
from app.prompts import ELORA_SYSTEM_PROMPT
from app.prompts.companion import COMPANION_SYSTEM_PROMPT
from app.tools.imagen import generate_image
from app.tools.lyria import generate_music

logger = logging.getLogger("chronicler")

APP_NAME = "emotional_chronicler"

# ── Story agent (Gemini 3.1 Pro Preview) ──────────────────────────────────────

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

# ── Session service (shared by both agents) ───────────────────────────────────

_session_service = InMemorySessionService()

runner = Runner(
    agent=elora_agent,
    app_name=APP_NAME,
    session_service=_session_service,
)

# ── Pre-story companion agent (Gemini 2.0 Flash) ─────────────────────────────
# Chats with the user before story generation to capture emotions, mood, and
# preferences. No tools — conversational only.

companion_agent = Agent(
    name="elora_companion",
    model=COMPANION_MODEL,
    description=(
        "Elora in companion mode — chats with the traveler before their story "
        "begins to understand their emotions, mood, and what kind of story "
        "would resonate with them."
    ),
    instruction=COMPANION_SYSTEM_PROMPT,
    tools=[],
)

companion_runner = Runner(
    agent=companion_agent,
    app_name=APP_NAME,
    session_service=_session_service,
)

logger.info(f"[Agent] Elora story agent ready — model: {STORY_MODEL}")
logger.info(f"[Agent] Elora companion ready — model: {COMPANION_MODEL}")
