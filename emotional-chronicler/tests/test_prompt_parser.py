"""Unit tests for app/server/prompt_parser.py."""

from app.server.prompt_parser import extract_and_strip_prompts, has_partial_marker


def test_extract_and_strip_prompts_single_marker():
    text = "Intro line. [[IMAGE_PROMPT: red dragon, stormy sky]] Outro."
    cleaned, prompts = extract_and_strip_prompts(text)

    assert cleaned == "Intro line.  Outro."
    assert prompts == ["red dragon, stormy sky"]


def test_extract_and_strip_prompts_multiple_markers_with_newlines():
    text = (
        "A\n"
        "[[IMAGE_PROMPT: first prompt,\nwith newline]]\n"
        "B\n"
        "[[IMAGE_PROMPT: second prompt]]"
    )
    cleaned, prompts = extract_and_strip_prompts(text)

    assert cleaned == "A\n\nB\n"
    assert prompts == ["first prompt,\nwith newline", "second prompt"]


def test_extract_and_strip_prompts_ignores_malformed_marker():
    text = "Visible text [[IMAGE_PROMPT: missing close"
    cleaned, prompts = extract_and_strip_prompts(text)

    assert cleaned == text
    assert prompts == []


def test_has_partial_marker_detects_open_marker_without_close():
    assert has_partial_marker("hello [[IMAGE_PROMPT: scenic valley") is True
    assert has_partial_marker("hello [[IMAGE_PROMPT: scenic valley]] done") is False
    assert has_partial_marker("plain text only") is False


def test_extract_and_strip_prompts_handles_adjacent_markers():
    text = "Lead [[IMAGE_PROMPT: sunrise skyline]][[IMAGE_PROMPT: neon alley]] finale"
    cleaned, prompts = extract_and_strip_prompts(text)

    assert cleaned == "Lead  finale"
    assert prompts == ["sunrise skyline", "neon alley"]


def test_has_partial_marker_only_looks_at_last_open_marker():
    text = "[[IMAGE_PROMPT: done]] middle [[IMAGE_PROMPT: pending"
    assert has_partial_marker(text) is True


def test_has_partial_marker_false_when_last_marker_closed():
    text = "[[IMAGE_PROMPT: closed]] trailing text"
    assert has_partial_marker(text) is False
