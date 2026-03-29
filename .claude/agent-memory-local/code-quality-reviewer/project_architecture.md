---
name: Backend Architecture Patterns
description: Key architectural patterns, conventions, and decisions observed in the Emotional Chronicler backend
type: project
---

The backend follows a clean layered architecture: factory.py assembles the app, routes are split by concern (routes.py for story SSE, chat_routes.py for companion SSE, session_routes.py for REST CRUD), and the store/firebase/agent layers are kept separate.

**Why:** Separation of concerns for a multi-feature ADK app with both streaming and REST endpoints.

**How to apply:** When suggesting new routes or features, follow the existing three-router pattern (router for static, api_router for stories, chat_router for companion). New features should get their own route file registered in factory.py.

Key conventions:
- All SSE routes return `StreamingResponse` with `_sse(payload)` helper — `_sse` is duplicated in routes.py and chat_routes.py (DRY violation, medium priority)
- All Firestore calls inside async SSE generators (event_stream closures) are wrapped with asyncio.to_thread() as of the 2026-03 fix pass — this is now consistently applied in routes.py
- Error handling uses graceful degradation: Firebase and Firestore both have `_available` flags and return None/False on failure instead of crashing
- Logger name is always `"chronicler"` across all modules
- f-strings and %-style logging are mixed inconsistently (should standardize on %-style for lazy evaluation)
- `base.py` / `google_search.py` in tools/ are dead code — `BaseTool` is never instantiated by the ADK tool registration path (ADK uses plain async functions, not subclasses)
- OPEN CRITICAL BUG (verified unfixed as of 2026-03-24 re-review): `elora_text_buffer` in routes.py `event_stream()` is declared inside the `try` block (line 212); the `except` handler references it at line 277, which raises UnboundLocalError if the exception occurs before line 212 — fix by declaring the buffer before `try:`
- `get_companion_title()` in store.py (lines 266–278) performs a second Firestore round-trip for the same document already fetched by `get_companion_context()` — known redundant read, medium priority
- Return type of `get_companion_title()` is `tuple[str, str] | tuple[None, None]` but actual return can be `tuple[None, str]` — annotation is narrower than reality (correct annotation: `tuple[str | None, str | None]`)
- `get_companion_context` (store.py ~194) and `get_session_context` (~319) share nearly identical interaction-formatting logic — DRY violation, candidate for a `_format_interactions(interactions, limit)` helper
- Missing PEP 8 blank line between `get_companion_context` and `get_companion_title` method definitions (store.py line 265–266)
- `elora_text_buffer` (routes.py line 137) is now correctly declared before `try:` — the UnboundLocalError bug from prior notes is FIXED
- `chat_routes.py` has NOT been updated to use asyncio.to_thread() for Firestore calls: lines 81, 85, 102 (in outer async handler), and lines 148-160 (inside event_stream generator) all call synchronous Firestore methods directly — this blocks the event loop and is the one remaining critical async correctness bug
- `_sse()` is still duplicated: identical implementation in routes.py (line 308) and chat_routes.py (line 200–201) — should live in a shared app/server/sse.py
- `BaseTool` / `ToolRegistry` / `GoogleSearchTool` in tools/ are confirmed dead code — never used by the ADK path; the registry is imported as a singleton but nothing in any route or agent calls `tool_registry`
- `verify_ws_token` in auth_middleware.py is dead code — no WebSocket routes exist; leftover from old architecture
- COMPANION_MODEL default in config.py is "gemini-3-flash-preview" (line 38) but docstring in agent.py says "Gemini 2.0 Flash" — model name inconsistency worth flagging
- `load_dotenv()` is called twice: once in main.py (line 7) and once at module level in config.py (line 15); the second call is a no-op but creates confusion
- Three previously flagged critical issues (store_ref UnboundLocalError, blocking Firestore in async in routes.py, private _doc_ref access) were all correctly fixed in the 2026-03 fix pass
