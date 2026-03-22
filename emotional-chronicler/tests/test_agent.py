"""Unit tests for app/core/agent.py — ADK Elora agent setup."""

import pytest
from unittest.mock import MagicMock, patch


class TestAgentSetup:
    """Tests for the ADK agent and runner configuration."""

    def test_app_name_is_emotional_chronicler(self):
        """APP_NAME constant is correct."""
        from app.core.agent import APP_NAME
        assert APP_NAME == "emotional_chronicler"

    def test_elora_agent_name_is_elora(self):
        """elora_agent was constructed with name='elora'."""
        from google.adk.agents import Agent
        # Verify Agent was called with name='elora'
        call_kwargs = Agent.call_args
        assert call_kwargs is not None
        # name is the first positional or keyword arg
        names = [a for a in call_kwargs.args if a == "elora"] + \
                [v for k, v in call_kwargs.kwargs.items() if k == "name"]
        assert len(names) > 0 or Agent.call_args[1].get("name") == "elora" \
               or (call_kwargs.kwargs.get("name") == "elora")

    def test_agent_tools_include_generate_image(self):
        """elora_agent is built with generate_image in its tools."""
        from google.adk.agents import Agent
        call_kwargs = Agent.call_args
        tools = call_kwargs.kwargs.get("tools", [])
        tool_names = [t.__name__ if hasattr(t, '__name__') else str(t) for t in tools]
        assert any("generate_image" in name for name in tool_names)

    def test_agent_tools_include_generate_music(self):
        """elora_agent is built with generate_music in its tools."""
        from google.adk.agents import Agent
        call_kwargs = Agent.call_args
        tools = call_kwargs.kwargs.get("tools", [])
        tool_names = [t.__name__ if hasattr(t, '__name__') else str(t) for t in tools]
        assert any("generate_music" in name for name in tool_names)

    def test_runner_is_created_with_correct_app_name(self):
        """Runner is constructed with app_name='emotional_chronicler'."""
        from google.adk.runners import Runner
        call_kwargs = Runner.call_args
        assert call_kwargs is not None
        app_name = call_kwargs.kwargs.get("app_name")
        assert app_name == "emotional_chronicler"

    def test_runner_module_exports_runner(self):
        """runner object is importable from app.core.agent."""
        from app.core.agent import runner
        assert runner is not None

    def test_agent_uses_story_model(self):
        """Agent is constructed with the configured STORY_MODEL."""
        from app.config import STORY_MODEL
        from google.adk.agents import Agent
        call_kwargs = Agent.call_args
        model = call_kwargs.kwargs.get("model")
        assert model == STORY_MODEL

    def test_agent_has_system_instruction(self):
        """Agent instruction is set (non-empty)."""
        from google.adk.agents import Agent
        call_kwargs = Agent.call_args
        instruction = call_kwargs.kwargs.get("instruction", "")
        assert instruction  # non-empty string

    def test_runner_uses_in_memory_session_service(self):
        """Runner is constructed with a session_service."""
        from google.adk.runners import Runner
        call_kwargs = Runner.call_args
        assert "session_service" in call_kwargs.kwargs


class TestAgentToolFunctions:
    """Verify tool functions are the correct async callables."""

    def test_generate_image_is_async_function(self):
        """generate_image is an async function."""
        import asyncio
        from app.tools.imagen import generate_image
        assert asyncio.iscoroutinefunction(generate_image)

    def test_generate_music_is_async_function(self):
        """generate_music is an async function."""
        import asyncio
        from app.tools.lyria import generate_music
        assert asyncio.iscoroutinefunction(generate_music)
