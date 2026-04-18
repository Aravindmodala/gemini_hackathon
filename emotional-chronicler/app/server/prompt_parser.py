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


def split_text_at_markers(text: str) -> list[str]:
    """Split text at [[IMAGE_PROMPT:...]] markers, returning N+1 text segments.

    Given text with N image markers, returns a list of N+1 strings where:
      - segments[0] is the text before the first marker
      - segments[i] is the text between marker i-1 and marker i
      - segments[N] is the text after the last marker

    All segments are stripped of leading/trailing whitespace. Segments may be
    empty strings if two markers are adjacent or the text starts/ends with one.

    Use extract_image_prompts() separately to retrieve the N prompt strings.

    Example:
        >>> split_text_at_markers("A [[IMAGE_PROMPT: forest]] B [[IMAGE_PROMPT: fire]] C")
        ['A', 'B', 'C']
    """
    # re.split with a capturing group yields [text0, prompt0, text1, prompt1, ...]
    # Even-indexed elements are the text segments; odd-indexed are captured prompts.
    parts = _IMAGE_PROMPT_RE.split(text)
    return [t.strip() for t in parts[0::2]]


def extract_image_prompts(text: str) -> list[str]:
    """Return the [[IMAGE_PROMPT:...]] prompt strings found in text.

    Does not modify the surrounding text — use split_text_at_markers() for that.

    Example:
        >>> extract_image_prompts("A [[IMAGE_PROMPT: forest]] B [[IMAGE_PROMPT: fire]] C")
        ['forest', 'fire']
    """
    return [m.group(1).strip() for m in _IMAGE_PROMPT_RE.finditer(text)]
