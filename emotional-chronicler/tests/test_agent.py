"""Unit tests for app/core/agent.py — ADK Elora agent setup.

Tests verify both the story agent (Gemini 3 Pro Image Preview) and the companion agent
(Gemini 2.0 Flash) are constructed correctly.
"""

import pytest
from unittest.mock import MagicMock, patch


class TestStoryAgentSetup:
    """Tests for the ADK story agent and runner configuration."""

    def test_app_name_is_emotional_chronicler(self):
        """APP_NAME constant is correct."""
        from app.core.agent import APP_NAME
        assert APP_NAME == "emotional_chronicler"

    def test_elora_agent_name_is_elora(self):
        """Story agent was constructed with name='elora'."""
        from google.adk.agents import Agent
        # First Agent() call is the story agent
        story_call = Agent.call_args_list[0]
        assert story_call.kwargs.get("name") == "elora"

    def test_agent_tools_are_empty(self):
        """Story agent has no tools — image generation is native to Gemini 3 Pro."""
        from google.adk.agents import Agent
        story_call = Agent.call_args_list[0]
        tools = story_call.kwargs.get("tools", [])
        assert tools == []

    def test_agent_has_generate_content_config(self):
        """Story agent has a generate_content_config for native image output."""
        from google.adk.agents import Agent
        story_call = Agent.call_args_list[0]
        config = story_call.kwargs.get("generate_content_config")
        assert config is not None

    def test_runner_is_created_with_correct_app_name(self):
        """Runner is constructed with app_name='emotional_chronicler'."""
        from google.adk.runners import Runner
        # First Runner() call is the story runner
        call_kwargs = Runner.call_args_list[0]
        assert call_kwargs is not None
        app_name = call_kwargs.kwargs.get("app_name")
        assert app_name == "emotional_chronicler"

    def test_runner_module_exports_runner(self):
        """runner object is importable from app.core.agent."""
        from app.core.agent import runner
        assert runner is not None

    def test_agent_uses_story_model(self):
        """Story agent uses the configured STORY_MODEL."""
        from app.config import STORY_MODEL
        from google.adk.agents import Agent
        story_call = Agent.call_args_list[0]
        model = story_call.kwargs.get("model")
        assert model == STORY_MODEL

    def test_agent_has_system_instruction(self):
        """Story agent instruction is set (non-empty)."""
        from google.adk.agents import Agent
        story_call = Agent.call_args_list[0]
        instruction = story_call.kwargs.get("instruction", "")
        assert instruction  # non-empty string

    def test_runner_uses_in_memory_session_service(self):
        """Runner is constructed with a session_service."""
        from google.adk.runners import Runner
        call_kwargs = Runner.call_args_list[0]
        assert "session_service" in call_kwargs.kwargs


class TestCompanionAgentSetup:
    """Tests for the pre-story companion agent configuration."""

    def test_companion_agent_exists(self):
        """companion_agent is importable."""
        from app.core.agent import companion_agent
        assert companion_agent is not None

    def test_companion_runner_exists(self):
        """companion_runner is importable."""
        from app.core.agent import companion_runner
        assert companion_runner is not None

    def test_companion_agent_uses_companion_model(self):
        """Companion agent uses the configured COMPANION_MODEL."""
        from app.config import COMPANION_MODEL
        from google.adk.agents import Agent
        # Second Agent() call is the companion agent
        companion_call = Agent.call_args_list[1]
        model = companion_call.kwargs.get("model")
        assert model == COMPANION_MODEL

    def test_companion_agent_has_no_tools(self):
        """Companion agent has no tools (conversational only)."""
        from google.adk.agents import Agent
        companion_call = Agent.call_args_list[1]
        tools = companion_call.kwargs.get("tools", [])
        assert tools == []

    def test_companion_agent_name_is_elora_companion(self):
        """Companion agent has name='elora_companion'."""
        from google.adk.agents import Agent
        companion_call = Agent.call_args_list[1]
        assert companion_call.kwargs.get("name") == "elora_companion"



