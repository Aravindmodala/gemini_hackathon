---
name: Emotional Chronicler backend patterns and known issues
description: Recurring conventions, anti-patterns, and architectural decisions observed in the backend codebase
type: project
---

All Firestore (SessionStore) calls must be wrapped in asyncio.to_thread() because SessionStore uses the synchronous google-cloud-firestore client inside FastAPI async handlers.

**Why:** The synchronous Firestore client blocks the event loop if called directly from async code, starving other requests during I/O waits.

**How to apply:** Any time a new route or handler calls a SessionStore instance method or static method, verify it is wrapped in `await asyncio.to_thread(...)`. This pattern is already established in routes.py, chat_routes.py, and session_routes.py.

Known: `store.log_companion_proposal` uses keyword arguments when called via asyncio.to_thread — this is correct because to_thread passes **kwargs through to the target.

Known: `_re` import for `_extract_proposal` is deferred inside the function body in chat_routes.py — this is a minor style issue (should be at module level) but not a bug.

Known: The `COMPANION_MODEL` default was previously `"gemini-3-flash-preview"` (invalid model ID). Fixed to `"gemini-2.0-flash"` as of Phase 1 bug fix.

Known: `store.end_session()` is NOT called in the companion route — intentional, because companion sessions remain "active" so the story route can later load companion context via resume_session.

Known: The companion route calls `store.log_companion_proposal` with keyword args via asyncio.to_thread — the function signature is `(title, brief, emotions, genre="", tone="")` which is compatible.
