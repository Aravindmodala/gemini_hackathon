"""
Tool registry with auto-discovery.

Scans all .py files in app/tools/ and automatically registers
any BaseTool subclasses found.
"""

import importlib
import inspect
import logging
import pkgutil
from pathlib import Path

from app.tools.base import BaseTool

logger = logging.getLogger("chronicler")


class ToolRegistry:
    """
    Auto-discovers and manages all BaseTool implementations.

    On instantiation, scans all .py modules in the tools/ package,
    finds BaseTool subclasses, and instantiates them.

    Provides:
      - get_declarations() → list of tool dicts for Gemini setup message
      - dispatch(name, **kwargs) → execute the matching tool handler
    """

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}
        self._discover()

    def _discover(self):
        """Auto-discover all BaseTool subclasses in the tools package."""
        package_dir = Path(__file__).parent

        for module_info in pkgutil.iter_modules([str(package_dir)]):
            # Skip the base class module and this __init__ module
            if module_info.name in ("base",):
                continue

            module = importlib.import_module(f"app.tools.{module_info.name}")

            for _, obj in inspect.getmembers(module, inspect.isclass):
                if issubclass(obj, BaseTool) and obj is not BaseTool:
                    tool = obj()
                    self._tools[tool.name] = tool
                    logger.info(f"[Tools] ✅ Registered: {tool.name}")

    def get_declarations(self, *, exclude_builtin: bool = False) -> list[dict]:
        """Return tool declarations for the Gemini setup message.

        Args:
            exclude_builtin: If True, omit built-in tools (e.g. googleSearch)
                that cannot be combined with functionDeclarations in the Live API.
        """
        tools = self._tools.values()
        if exclude_builtin:
            tools = [t for t in tools if not t.is_builtin]
        return [tool.declaration for tool in tools]

    async def dispatch(self, name: str, **kwargs) -> dict:
        """
        Dispatch a tool call to the matching handler.

        Built-in tools (is_builtin=True) are skipped — Gemini handles them.
        """
        tool = self._tools.get(name)

        if tool is None:
            logger.warning(f"[Tools] ⚠️  Unknown tool called: {name}")
            return {"error": f"Unknown tool: {name}"}

        if tool.is_builtin:
            logger.info(f"[Tools] Built-in tool '{name}' — handled by Gemini")
            return {}

        logger.info(f"[Tools] Executing: {name}")
        return await tool.execute(**kwargs)


# Singleton registry — created once on import
tool_registry = ToolRegistry()

__all__ = ["BaseTool", "ToolRegistry", "tool_registry"]
