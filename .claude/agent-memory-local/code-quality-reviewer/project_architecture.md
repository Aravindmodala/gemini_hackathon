---
name: Backend Architecture Patterns
description: Key architectural patterns, conventions, and known issues in the Emotional Chronicler backend — current as of 2026-03-29 full re-review
type: project
---

The backend follows a clean layered architecture: factory.py assembles the app, routes are split by concern (routes.py for story SSE, chat_routes.py for companion SSE, session_routes.py for REST CRUD), and the store/firebase/agent layers are kept separate.

**Why:** Separation of concerns for a multi-feature ADK app with both streaming and REST endpoints.

**How to apply:** When suggesting new routes or features, follow the existing three-router pattern. New features should get their own route file registered in factory.py.

## Verified-current issues (2026-03-29 full re-review)

### Fixed since last review
- `_sse()` duplication is FIXED: both routes now import `format_sse_event` from `app/server/sse.py`
- `elora_text_buffer` is correctly declared before `try:` — UnboundLocalError bug is fixed
- Firestore calls in routes.py are correctly wrapped in `asyncio.to_thread()`

### Active critical issues
1. **`generate_image` is synchronous inside async ADK tool** (imagen.py): `get_genai_client().models.generate_images()` is a blocking call — called directly inside an `async def` function. There is no `await` or `asyncio.to_thread()` wrapping it. Blocks the event loop during image generation.
2. **`generate_music` credential refresh is synchronous** (lyria.py): `credentials.refresh(auth_request)` at line 59 uses `google.auth.transport.requests.Request()` which is a synchronous HTTP call — inside an `async def` function. Should use `google.auth.transport.aiohttp.Request` or be wrapped in `asyncio.to_thread()`.
3. **`get_companion_data` duplicates `get_companion_context`** (store.py lines 308-378): These two methods contain nearly 100% identical logic for building the companion context string, differing only in also returning `proposed_title`/`proposed_brief`. The duplication is exact — same f-strings, same `_companion_fmt` closure, same separator lines. The callers in routes.py always use `get_companion_data`, making `get_companion_context` dead code.
4. **`get_companion_title`** (store.py lines 384-396): Performs a third Firestore round-trip to fetch data already loaded by `get_companion_data`. Not called by any route — confirmed dead code.
5. **`SessionQueryService.delete_session`** (session_routes.py lines 74-79): Performs two Firestore reads (get_session to check existence + then delete). The get before delete is technically a TOCTOU race — the document could be deleted between the existence check and the actual delete. Should delete directly and handle the 404 case from the delete result.

### Active DRY violations
- `get_companion_context` (store.py ~231) and `get_companion_data` (store.py ~308): identical context-building logic. `get_companion_data` supersedes `get_companion_context` — the latter should be removed and callers (currently none for this method) removed too.
- `_session_fmt` closure in `get_session_context` and `_previous_fmt` in `get_previous_context` (store.py ~450 and ~516): near-identical formatters for user/elora/tool entries — differ only in the label strings. Candidate for a shared `_format_role(role, text, tool_name)` helper.
- `list_sessions` in `SessionQueryService` hard-codes the Firestore collection path `sessions/{uid}/conversations` — same path is built in three places: `_session_doc_ref()`, `get_previous_context()`, and `list_sessions()`.

### Architecture observations
- `ADKSessionManager` is instantiated fresh on every request (routes.py, chat_routes.py) rather than being a singleton — minor YAGNI; the class has no state, could just be a standalone function `ensure_adk_session_exists(runner, app_name, user_id, session_id)`.
- `SessionResolver` is also instantiated fresh on every request — same observation; it has no state and `resolve()` could be a module-level async function.
- Both agents share a single `_session_service = InMemorySessionService()` in agent.py — this means companion and story sessions share the same in-memory namespace. This is intentional (shared session IDs) but fragile: if ADK session IDs collide between agents, state bleeds across.
- `COMPANION_MODEL` default in config.py is `"gemini-2.0-flash"` — consistent with agent.py comment.
- Logger name is always `"chronicler"` — correct and consistent.
- All Firestore calls in async contexts are wrapped in `asyncio.to_thread()` in routes.py and session_routes.py — correct.
- chat_routes.py outer handler (lines 93-94) calls `store.log_interaction` directly with `await asyncio.to_thread(...)` — correctly wrapped.

### Dead code
- `get_companion_context()` in store.py — superseded by `get_companion_data()`, not called by any current route.
- `get_companion_title()` in store.py — not called by any current route; `get_companion_data()` returns the same data.
- `get_user_info()` in firebase.py — not called anywhere in the codebase.
- `credentials` param in `firebase_admin.initialize_app()` uses ADC (no explicit credentials) which is correct, but the `credentials` import at the top of firebase.py is unused.
