"""
Image prompt marker parser for the Power Couple pipeline.

Extracts [[IMAGE_PROMPT: ...]] markers from streaming text chunks,
handling markers that may span multiple chunks.
"""
import re

_IMAGE_PROMPT_RE = re.compile(r"\[\[IMAGE_PROMPT:\s*(.*?)\]\]", re.DOTALL)
_IMAGE_PROMPT_PREFIX = "[[IMAGE_PROMPT:"


def extract_and_strip_prompts(text: str) -> tuple[str, list[str]]:
    """Extract all complete image prompt markers and return cleaned text + image prompts.

    Returns:
        (visible_text, image_prompts) — text with markers removed, list of image prompts
    """
    prompts = [m.group(1).strip() for m in _IMAGE_PROMPT_RE.finditer(text)]
    cleaned = _IMAGE_PROMPT_RE.sub("", text)
    return cleaned, prompts


def has_partial_marker(text: str) -> bool:
    """Check if text ends with an incomplete [[IMAGE_PROMPT: ... (no closing ]])."""
    last_open = text.rfind("[[IMAGE_PROMPT:")
    if last_open == -1:
        return False
    last_close = text.find("]]", last_open)
    return last_close == -1
