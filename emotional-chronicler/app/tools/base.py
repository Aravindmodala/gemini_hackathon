"""Base class for all Gemini tools."""

from abc import ABC, abstractmethod


class BaseTool(ABC):
    """
    Abstract base class that all tools must implement.

    To create a new tool:
      1. Create a new .py file in app/tools/
      2. Subclass BaseTool
      3. Implement `name`, `declaration`, and `execute`
      4. The tool is automatically registered on startup — no config needed.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique name for this tool (used for dispatch routing)."""
        ...

    @property
    @abstractmethod
    def declaration(self) -> dict:
        """
        Return the Gemini tool declaration dict.

        For built-in tools (e.g., googleSearch):
            {"googleSearch": {}}

        For custom function declarations:
            {
                "functionDeclarations": [{
                    "name": "...",
                    "description": "...",
                    "parameters": { ... }
                }]
            }
        """
        ...

    @abstractmethod
    async def execute(self, **kwargs) -> dict:
        """
        Execute the tool with the given arguments and return a result dict.

        The result will be sent back to Gemini as a tool response.
        For built-in tools that Gemini handles internally, return an empty dict.
        """
        ...

    @property
    def is_builtin(self) -> bool:
        """
        Whether this is a Gemini built-in tool (e.g., googleSearch).

        Built-in tools are included in declarations but never dispatched locally.
        Override and return True for built-in tools.
        """
        return False
