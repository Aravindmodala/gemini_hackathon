"""Google Search — built-in Gemini grounding tool."""

from app.tools.base import BaseTool


class GoogleSearchTool(BaseTool):
    """
    Built-in Google Search grounding tool.

    Gemini handles execution internally — no local dispatch needed.
    This plugin exists so the declaration is included in the setup message.
    """

    @property
    def name(self) -> str:
        return "google_search"

    @property
    def declaration(self) -> dict:
        return {"googleSearch": {}}

    async def execute(self, **kwargs) -> dict:
        # Built-in tool — Gemini handles this internally.
        return {}

    @property
    def is_builtin(self) -> bool:
        return True
