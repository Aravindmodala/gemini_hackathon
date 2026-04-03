# Backend Code Review — Emotional Chronicler

> Generated: 2026-03-26 | Branch: `feat/fixing_story` | Scope: `emotional-chronicler/`

---

## Table of Contents

1. [SOLID Principles Assessment](#solid-principles-assessment)
2. [DRY Violations](#dry-violations)
3. [YAGNI Violations](#yagni-violations)
4. [Missing Abstractions](#missing-abstractions)
5. [Async / Runtime Bugs](#async--runtime-bugs)
6. [Testability Gaps](#testability-gaps)
7. [Minor Issues](#minor-issues)
8. [What's Done Well](#whats-done-well)
9. [Prioritized Fix List](#prioritized-fix-list)

---

## SOLID Principles Assessment

### S — Single Responsibility Principle

**Status: VIOLATED**

#### Violation 1 — `SessionStore` has 5+ responsibilities

**File:** `app/core/store.py`

`SessionStore` currently handles:

- Session CRUD lifecycle (`create_session`, `resume_session`, `end_session`)
- Interaction logging (`log_interaction`, `log_tool_call`)
- Companion proposal logging (`log_companion_proposal`)
- Context formatting for narrative injection (`get_companion_context`, `get_session_context`, `get_previous_context`)
- Static read-model queries (`list_sessions`, `get_session`, `delete_session`, `update_session_title`)

The static query methods (used exclusively by `session_routes.py`) have no relationship to the instance state — they are a separate concern entirely.

**Proposed split:**

```
SessionStore          → session lifecycle (create/resume/end/log)
SessionQueryService   → static read-model (list/get/delete/update_title)
ContextBuilder        → narrative context formatting
```

---

#### Violation 2 — `generate_story()` is a 220-line god function

**File:** `app/server/routes.py:81-305`

This single function handles:

- Auth resolution
- Session create/resume decision
- Companion context loading
- ADK session setup
- SSE event generation loop
- Firestore flushing
- Error handling

Each concern should be extracted into its own unit (see [Missing Abstractions](#missing-abstractions)).

---

### O — Open/Closed Principle

**Status: MOSTLY FOLLOWED — gap in tool layer**

`BaseTool` in `app/tools/base.py` establishes a correct OCP pattern. New tools should extend `BaseTool` without modifying the base. However:

- `app/tools/imagen.py` — plain async function, does **not** extend `BaseTool`
- `app/tools/lyria.py` — plain async function, does **not** extend `BaseTool`

Only `GoogleSearchTool` uses `BaseTool`. The abstraction exists but is not enforced, so it provides no actual protection.

**Before (current):**

```python
# imagen.py:21 — plain function, bypasses BaseTool
async def generate_image(scene_description: str, style: str = "...") -> dict:
    ...
```

**After:**

```python
# imagen_tool.py — properly extends BaseTool
class ImagenTool(BaseTool):
    @property
    def name(self) -> str:
        return "generate_image"

    async def execute(self, **kwargs) -> dict:
        return await _generate_image_impl(
            scene_description=kwargs["scene_description"],
            style=kwargs.get("style", "cinematic fantasy illustration..."),
        )
```

---

### L — Liskov Substitution Principle

**Status: VIOLATED**

**File:** `app/tools/base.py:53-61`, `app/tools/__init__.py:70-81`, `app/tools/google_search.py:22-28`

`GoogleSearchTool` has an `is_builtin = True` property. The dispatcher in `ToolRegistry.dispatch()` special-cases it:

```python
# tools/__init__.py:76-78 — breaks substitutability
if tool.is_builtin:
    logger.info(f"[Tools] Built-in tool '{name}' — handled by Gemini")
    return {}
```

A `BaseTool` subclass should be uniformly substitutable. Callers should not need to inspect `is_builtin` to dispatch correctly. The fix is to remove `is_builtin` and let `execute()` return `{}` as the legitimate contract for built-in tools — which already happens.

**Before:**

```python
@property
def is_builtin(self) -> bool:
    return True

# dispatch() checks it:
if tool.is_builtin:
    return {}
```

**After:**

```python
# Remove is_builtin entirely.
# GoogleSearchTool.execute() returns {} — that IS the contract.
# dispatch() calls execute() uniformly for all tools.
async def dispatch(self, name: str, **kwargs) -> dict:
    tool = self._tools.get(name)
    if tool is None:
        return {"error": f"Unknown tool: {name}"}
    return await tool.execute(**kwargs)
```

---

### I — Interface Segregation Principle

**Status: VIOLATED**

**File:** `app/core/store.py`

`SessionStore` exposes 13+ public methods to all callers. Callers in `session_routes.py` only ever use the 4 static query methods and never instantiate the class. Callers in `routes.py` only use the lifecycle/logging methods. No caller uses all 13 methods.

**Current bloated interface:**

```python
class SessionStore:
    # Instance lifecycle (used by routes.py / chat_routes.py)
    def create_session(...)
    def resume_session(...)
    def end_session(...)
    def log_interaction(...)
    def log_tool_call(...)
    def log_companion_proposal(...)
    def get_companion_context(...)
    def get_companion_title(...)
    def get_session_context(...)
    def get_previous_context(...)

    # Static queries (used ONLY by session_routes.py — no instance needed)
    @staticmethod def list_sessions(...)
    @staticmethod def get_session(...)
    @staticmethod def delete_session(...)
    @staticmethod def update_session_title(...)
```

**Proposed segregated interfaces:**

```python
class SessionStore:       # lifecycle + logging only
class SessionQueryService:  # static queries only (separate module)
```

---

### D — Dependency Inversion Principle

**Status: PARTIALLY FOLLOWED**

**Good:** `factory.py` correctly uses `Depends(get_current_user)` for auth injection. Auth is abstracted.

**Violations:**

**File:** `app/server/routes.py:107, 176`

```python
# Direct instantiation — high-level module depends on concrete class
store = SessionStore(user_id)
companion_store = SessionStore(user_id)
```

A factory or provider should be injected instead of `SessionStore` being instantiated directly inside the streaming generator.

**File:** `app/tools/imagen.py:16`, `app/tools/lyria.py:19`

```python
# Tools import config directly — coupled to the config module
from app.config import get_genai_client, IMAGEN_MODEL, IMAGE_CACHE_DIR
```

Tools should receive their dependencies (client, model name, cache dir) through their constructor rather than pulling from a global config singleton.

---

## DRY Violations

### DRY-1 — `_sse()` duplicated in two route files

**Files:** `app/server/routes.py:308-310` and `app/server/chat_routes.py:200-201`

Identical implementation in both files:

```python
def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
```

Any change to the SSE wire format (e.g. adding an `id:` field) must be applied in two places. A missed update will desync the story and companion streams, which the frontend parses identically.

**Fix:** Create `app/server/sse.py`:

```python
import json

def format_sse_event(payload: dict) -> str:
    """Format a dict as a Server-Sent Events data line."""
    return f"data: {json.dumps(payload)}\n\n"
```

Both route files import and use `format_sse_event`.

---

### DRY-2 — Session initialization logic duplicated across both route files

**Files:** `app/server/routes.py:105-119` and `app/server/chat_routes.py:77-91`

Both handlers contain nearly identical logic for:

- Checking if the user is authenticated
- Deciding whether to create a new session or resume an existing one
- Falling back to anonymous session IDs

The `routes.py` version uses `asyncio.to_thread()` (correct). The `chat_routes.py` version does not (bug — see [Async / Runtime Bugs](#async--runtime-bugs)).

**Fix:** Extract a `SessionResolver` class:

```python
# app/server/session_resolver.py
class SessionResolver:
    async def resolve(
        self,
        auth_user: dict | None,
        requested_user_id: str | None,
        requested_session_id: str | None,
        session_title: str = "Untitled Story",
    ) -> tuple[str, str, SessionStore | None, str]:
        """Returns (user_id, session_id, store, decision)."""
        ...
```

---

### DRY-3 — ADK session ensure-or-create duplicated

**Files:** `app/server/routes.py:149-171` and `app/server/chat_routes.py:109-125`

Both files check if an ADK session exists and create it if not:

```python
existing = await runner.session_service.get_session(
    app_name=APP_NAME, user_id=user_id, session_id=session_id,
)
if not existing:
    await runner.session_service.create_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id,
    )
```

**Fix:** Extract `ADKSessionManager`:

```python
# app/core/adk_session_manager.py
class ADKSessionManager:
    async def ensure_session_exists(self, user_id: str, session_id: str) -> None:
        ...
```

---

### DRY-4 — Interaction-formatting loop duplicated three times

**File:** `app/core/store.py:235-243`, `store.py:339-350`, `store.py:378-430`

`get_companion_context()`, `get_session_context()`, and `get_previous_context()` all iterate over interactions and format them into narrative strings with near-identical loop structures. The format strings differ slightly (different person and tense), but the iteration, limit logic, and None-filtering are identical.

**Fix:** Extract `ContextBuilder._format_interaction_lines(interactions, limit, style)` private function. The three methods call it with their respective style parameters.

---

### DRY-5 — Firestore document path repeated five times

**File:** `app/core/store.py`

The expression:

```python
db.collection("sessions").document(user_id).collection("conversations").document(session_id)
```

appears in `_init_doc_ref()`, `create_session()`, `get_session()`, `delete_session()`, and `update_session_title()`.

**Fix:** Extract a private helper:

```python
def _session_doc_ref(db, user_id: str, session_id: str):
    return (
        db.collection("sessions")
        .document(user_id)
        .collection("conversations")
        .document(session_id)
    )
```

---

### DRY-6 — `load_dotenv()` called twice

**Files:** `main.py:7` and `app/config.py:15`

`main.py` calls `load_dotenv()` before importing any app modules. `config.py` calls it again at module level. The second call is always a no-op but implies `config.py` can be safely imported without `main.py`'s initialization, which is misleading.

**Fix:** Remove `load_dotenv()` from `config.py`. Add a comment:

```python
# Environment must be loaded by the entry point before importing this module.
# main.py calls load_dotenv() before any app.* imports.
```

---

## YAGNI Violations

### YAGNI-1 — `BaseTool`, `ToolRegistry`, `GoogleSearchTool` — entire OOP tool layer is unused

**Files:** `app/tools/base.py`, `app/tools/google_search.py`, `app/tools/__init__.py`

The `ToolRegistry` auto-discovers and registers all `BaseTool` subclasses on import. The ADK agent in `agent.py` registers tools as plain async functions and never touches the registry. No route, factory, or agent imports `tool_registry` or calls `dispatch()`.

Additional cost: `ToolRegistry.__init__` imports all tool modules at startup as a hidden side effect, slowing cold starts with no benefit.

**Fix:** Delete `app/tools/base.py`, `app/tools/google_search.py`. Replace `app/tools/__init__.py` with:

```python
from .imagen import generate_image
from .lyria import generate_music

__all__ = ["generate_image", "generate_music"]
```

---

### YAGNI-2 — `verify_ws_token` is dead code from the old WebSocket architecture

**File:** `app/server/auth_middleware.py:73-88`

No WebSocket routes exist anywhere in the codebase. The project fully migrated from WebSocket to ADK+SSE (documented in `CLAUDE.md`). This function is never called.

**Fix:** Delete lines 73-88 from `auth_middleware.py`.

---

### YAGNI-3 — `store_ref` alias adds zero value

**File:** `app/server/routes.py`

`store_ref = store` is assigned and then used interchangeably with `store` throughout `event_stream()`. The alias was presumably added to distinguish the story store from the companion store, but `store` would be equally clear.

**Fix:** Remove `store_ref`. Use `store` consistently. Rename `companion_store` to `companion_session` for clarity.

---

## Missing Abstractions

These are abstractions that **should exist** to reduce coupling and duplication.

### MA-1 — `app/server/sse.py` — SSE event formatter

Both streaming routes need `format_sse_event(payload: dict) -> str`. This is a single line but the right place to centralize the SSE wire format contract.

---

### MA-2 — `SessionResolver` — session init decision logic

The "authenticated vs anonymous, create vs resume" decision happens in both route files with slightly different implementations. A `SessionResolver` class encapsulates this logic once and fixes the async bug in `chat_routes.py` as a side effect.

---

### MA-3 — `ADKSessionManager` — ADK session ensure-or-create

A two-method class (`ensure_session_exists`, `run_agent_stream`) would encapsulate the ADK lifecycle currently duplicated across routes.

---

### MA-4 — `ContextBuilder` — narrative context formatting

The three `get_*_context()` methods in `store.py` share identical loop structure. A `ContextBuilder` with a parameterized format style would eliminate the duplication and make it trivial to add a fourth context format in future.

---

### MA-5 — `SessionQueryService` — read-model for session REST API

The four static methods on `SessionStore` that serve `session_routes.py` should live in their own module. They have no dependency on instance state and are logically a separate service.

---

### MA-6 — `ToolResultHandler` — tool result → SSE event converter

`routes.py:245-263` converts tool results (image URL, audio URL) to SSE events and logs them to Firestore. This pattern is a candidate for a dedicated handler class, especially if more tools are added later.

---

## Async / Runtime Bugs

### BUG-1 — All Firestore calls in `chat_routes.py` block the event loop

**File:** `app/server/chat_routes.py:81, 85, 87, 102, 148-160`
**Severity: CRITICAL**

All Firestore calls in `chat_routes.py` are synchronous, called directly on the async event loop:

```python
# chat_routes.py:81 — blocks event loop
resumed = store.resume_session(request.session_id)

# chat_routes.py:85 — blocks event loop
session_id = store.create_session("Companion Chat")

# chat_routes.py:102 — blocks event loop
store.log_interaction("user", request.message)

# chat_routes.py:148-160 — blocks event loop inside event_stream
store.log_interaction("elora", full_response)
store.log_companion_proposal(...)
```

`routes.py` fixed this correctly with `asyncio.to_thread()`. `chat_routes.py` was never updated. Under load, a single slow Firestore write will stall all concurrent SSE streams.

**Fix:** Wrap all Firestore calls in `asyncio.to_thread()`:

```python
# Outer handler
resumed = await asyncio.to_thread(store.resume_session, request.session_id)
session_id = await asyncio.to_thread(store.create_session, "Companion Chat")
await asyncio.to_thread(store.log_interaction, "user", request.message)

# Inside event_stream
await asyncio.to_thread(store.log_interaction, "elora", full_response)
await asyncio.to_thread(store.log_companion_proposal, title=..., brief=...)
```

---

### BUG-2 — `COMPANION_MODEL` default is an unrecognized model name

**File:** `app/config.py:38`
**Severity: CRITICAL**

```python
COMPANION_MODEL = os.environ.get("COMPANION_MODEL", "gemini-3-flash-preview")
```

`"gemini-3-flash-preview"` does not correspond to any known Vertex AI model. The correct name is `"gemini-2.0-flash"`. Without an env override, the companion agent will fail to initialize at runtime.

**Fix:**

```python
COMPANION_MODEL = os.environ.get("COMPANION_MODEL", "gemini-2.0-flash")
```

---

### BUG-3 — Redundant Firestore round-trip for companion context + title

**File:** `app/core/store.py:267-279`, called from `app/server/routes.py:191`
**Severity: Medium**

`routes.py` calls `get_companion_context()` then `get_companion_title()` sequentially. Both fetch the same Firestore document. This adds 10–50ms of unnecessary latency on every story start that has a companion session.

**Fix:** Add a `get_companion_data()` method that fetches the document once and returns `(context, title, brief)`:

```python
def get_companion_data(self) -> tuple[str | None, str | None, str | None]:
    """Returns (context_str, proposed_title, proposed_brief) in one fetch."""
    ...
```

---

### BUG-4 — `factory.py` hardcodes `"lyria-002"` instead of using `LYRIA_MODEL`

**File:** `app/server/factory.py:48`
**Severity: Low**

```python
logger.info(f"   Music:    lyria-002  (Lyria 2)")
```

`config.py` defines `LYRIA_MODEL`. If the model is changed in config, the startup log silently shows the wrong value.

**Fix:**

```python
from app.config import LYRIA_MODEL
logger.info(f"   Music:    {LYRIA_MODEL}  (Lyria 2)")
```

---

## Testability Gaps

### TEST-1 — `chat_routes.py` has zero test coverage

There is no `test_chat_routes.py`. The companion endpoint (`POST /api/v1/companion`) is completely untested at the route level — and it contains the critical async bug above.

**Minimum test cases needed:**

- Companion streams text and `done` events
- Companion creates a new session when none is provided
- Companion resumes existing session when `session_id` is provided
- User and Elora interactions are logged to Firestore
- `_extract_proposal()` parses a valid `story_proposal` JSON block
- `_extract_proposal()` returns `None` for malformed JSON

---

### TEST-2 — `store.py` context methods are untested

`get_companion_context()`, `get_session_context()`, and `get_previous_context()` are called in the hot path of every story start. No tests exist for:

- Returns `None` when `_doc_ref` is `None`
- Returns `None` when Firestore document doesn't exist
- Correctly formats known interaction lists
- Handles empty or partially-populated interaction arrays

---

### TEST-3 — `_extract_proposal()` is untested and inline

**File:** `app/server/chat_routes.py:184-197`

This function is pure (no side effects), easily testable, and critical to the companion → story handoff. It also has an `import re` inside the function body (a minor style issue — imports belong at the top).

---

## Minor Issues

### MINOR-1 — `Optional[X]` should be `X | None`

**Files:** `routes.py:19`, `chat_routes.py:22`, `session_routes.py:8`, `auth_middleware.py:8`, `firebase.py:9`

The project already uses Python 3.10+ union syntax (`str | None`) in `store.py`. Standardize throughout.

---

### MINOR-2 — f-strings in `logger` calls

**Files:** `firebase.py:49, 80, 83` and several tool files

f-strings in logging calls always evaluate the string even if the log level is filtered out. Use `%-style` lazy evaluation instead:

```python
# Before
logger.warning(f"[Firebase] Initialization failed: {e}")

# After
logger.warning("[Firebase] Initialization failed: %s", e)
```

---

### MINOR-3 — `UpdateTitleRequest` has no length validation

**File:** `app/server/session_routes.py:22-23`

```python
class UpdateTitleRequest(BaseModel):
    title: str
```

An empty string or a 10,000-character title are both accepted. Add:

```python
from pydantic import field_validator

class UpdateTitleRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_must_be_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title must not be empty")
        if len(v) > 200:
            raise ValueError("title must be 200 characters or fewer")
        return v
```

---

### MINOR-4 — `ELORA_FLUSH_CHARS` magic constant inside generator

**File:** `app/server/routes.py:139`

```python
ELORA_FLUSH_CHARS = 800  # flush to Firestore every ~800 characters
```

This is defined inside `event_stream()`, styled as a constant. Move to module scope or to `config.py` as an env-configurable value:

```python
FIRESTORE_FLUSH_CHARS = int(os.environ.get("FIRESTORE_FLUSH_CHARS", 800))
```

---

### MINOR-5 — `import re` inside `_extract_proposal()`

**File:** `app/server/chat_routes.py:185`

```python
def _extract_proposal(text: str) -> dict | None:
    import re  # <-- import inside function
    ...
```

Move `import re` to the top of `chat_routes.py`.

---

## What's Done Well

- **Graceful degradation:** `store.py` and `firebase.py` use `_available` flags and return `None` on missing GCP services. No hard crashes in dev without credentials.
- **Path traversal protection:** `serve_image()` and `serve_music()` in `routes.py` use `path.is_relative_to(cache_dir.resolve())` before serving files — correct defense against directory traversal.
- **Pydantic validators:** `StoryRequest` and `CompanionRequest` both strip and validate input correctly using `@field_validator`.
- **SSE contract:** Every event has a `type` discriminant; streams always terminate with `done` or `error`; errors don't leak internal details to the client.
- **Test coverage of story SSE flow:** `test_routes.py` covers text/image/music events, empty event skipping, tool errors, session create vs resume, anonymous vs authenticated, and terminal events. Mock helpers are reusable.

---

## Prioritized Fix List

| #   | File                                                           | Issue                                                             | Category   | Priority     |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------- | ---------- | ------------ |
| 1   | `chat_routes.py:81-160`                                        | Missing `asyncio.to_thread()` — blocks event loop                 | Bug        | **Critical** |
| 2   | `config.py:38`                                                 | `COMPANION_MODEL` default is an invalid model name                | Bug        | **Critical** |
| 3   | `routes.py:308` + `chat_routes.py:200`                         | Duplicate `_sse()` — extract to `app/server/sse.py`               | DRY        | High         |
| 4   | `tools/base.py`, `tools/google_search.py`, `tools/__init__.py` | Dead OOP tool layer — delete                                      | YAGNI      | High         |
| 5   | `auth_middleware.py:73-88`                                     | Dead `verify_ws_token` from old WebSocket arch — delete           | YAGNI      | High         |
| 6   | `routes.py:105-119` + `chat_routes.py:77-91`                   | Duplicate session init logic — extract `SessionResolver`          | DRY        | High         |
| 7   | `routes.py:149-171` + `chat_routes.py:109-125`                 | Duplicate ADK session setup — extract `ADKSessionManager`         | DRY        | High         |
| 8   | `store.py`                                                     | SRP + ISP — split static query methods into `SessionQueryService` | SOLID      | Medium       |
| 9   | `store.py:235-350`                                             | Duplicate interaction-formatting loops — extract `ContextBuilder` | DRY        | Medium       |
| 10  | `store.py`                                                     | Firestore path repeated 5× — extract `_session_doc_ref()`         | DRY        | Medium       |
| 11  | `store.py:267-279`                                             | Redundant Firestore fetch for companion title+context             | Bug        | Medium       |
| 12  | `chat_routes.py`                                               | Zero test coverage — add `test_chat_routes.py`                    | Testing    | Medium       |
| 13  | `store.py`                                                     | Context methods untested                                          | Testing    | Medium       |
| 14  | `config.py:15`                                                 | Duplicate `load_dotenv()`                                         | DRY        | Low          |
| 15  | `factory.py:48`                                                | Hardcoded `"lyria-002"` instead of `LYRIA_MODEL`                  | Bug        | Low          |
| 16  | `tools/base.py` (if kept)                                      | `is_builtin` breaks LSP — remove property, use polymorphism       | SOLID      | Low          |
| 17  | Multiple                                                       | `Optional[X]` → `X \| None` union syntax                          | Style      | Low          |
| 18  | Multiple                                                       | f-strings in `logger` calls → `%-style`                           | Style      | Low          |
| 19  | `session_routes.py:22-23`                                      | `UpdateTitleRequest.title` missing length validation              | Validation | Low          |
| 20  | `routes.py:139`                                                | `ELORA_FLUSH_CHARS` magic constant inside function                | Style      | Low          |
| 21  | `chat_routes.py:185`                                           | `import re` inside function body                                  | Style      | Low          |

---

## Implementation Phases

> **For the coding agent:** Read this section carefully before touching any code. Work through phases in order. Complete every item in a phase and verify the stop condition before moving to the next phase. Do not skip ahead.

---

### ⚡ CURRENT TASK — Phase 1: Critical Bug Fixes

**Implement Phase 1 now. Do not proceed to Phase 2 until the stop condition is met.**

There are 2 changes. Both are runtime failures that must be fixed before anything else.

#### Fix 1 — `chat_routes.py` — Wrap all Firestore calls in `asyncio.to_thread()`

**File:** `app/server/chat_routes.py`

Every Firestore call in this file is synchronous and called directly on the async event loop. This blocks all concurrent SSE streams under load. `routes.py` already fixes this correctly with `asyncio.to_thread()` — apply the same pattern here.

Lines to fix:

```python
# Line ~81 — blocks event loop
resumed = store.resume_session(request.session_id)
# Fix:
resumed = await asyncio.to_thread(store.resume_session, request.session_id)

# Line ~85 — blocks event loop
session_id = store.create_session("Companion Chat")
# Fix:
session_id = await asyncio.to_thread(store.create_session, "Companion Chat")

# Line ~102 — blocks event loop
store.log_interaction("user", request.message)
# Fix:
await asyncio.to_thread(store.log_interaction, "user", request.message)

# Lines ~148-160 — blocks event loop inside event_stream generator
store.log_interaction("elora", full_response)
store.log_companion_proposal(...)
# Fix:
await asyncio.to_thread(store.log_interaction, "elora", full_response)
await asyncio.to_thread(store.log_companion_proposal, title=..., brief=...)
```

Make sure `import asyncio` is at the top of the file.

#### Fix 2 — `config.py` — Correct the `COMPANION_MODEL` default

**File:** `app/config.py`, line ~38

```python
# Before (invalid model name — will fail at runtime):
COMPANION_MODEL = os.environ.get("COMPANION_MODEL", "gemini-3-flash-preview")

# After:
COMPANION_MODEL = os.environ.get("COMPANION_MODEL", "gemini-2.0-flash")
```

#### Stop Condition

- Backend starts without errors.
- The companion endpoint (`POST /api/v1/companion`) no longer blocks the event loop.
- All existing tests still pass (`pytest`).

---

### Phase 2: Dead Code Removal

> Do not start this phase until Phase 1 stop condition is met.

6 changes — pure deletions and no-logic-change rewrites. No new abstractions.

| # | File | Action |
|---|------|--------|
| 1 | `app/tools/base.py` | Delete the file entirely |
| 2 | `app/tools/google_search.py` | Delete the file entirely |
| 3 | `app/tools/__init__.py` | Replace entire contents with a 3-line module that only exports `generate_image` and `generate_music` |
| 4 | `app/server/auth_middleware.py:73-88` | Delete the `verify_ws_token` function (dead code from old WebSocket architecture) |
| 5 | `app/server/routes.py` | Remove `store_ref = store`; replace every `store_ref` usage with `store` |
| 6 | `app/config.py:15` | Remove the `load_dotenv()` call; add a comment: `# Environment must be loaded by the entry point before importing this module.` |
| 7 | `app/server/chat_routes.py:185` | Move `import re` from inside `_extract_proposal()` to the top of the file |
| 8 | `app/server/factory.py:48` | Replace hardcoded `"lyria-002"` string with `LYRIA_MODEL` imported from `app.config` |

**Stop condition:** all existing tests still pass; no import errors; no references to deleted symbols remain.

---

### Phase 3: Shared SSE Utility

> Do not start this phase until Phase 2 stop condition is met.

Create one new file and update two existing files.

**New file:** `app/server/sse.py`

```python
import json

def format_sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
```

**Update:** `app/server/routes.py` — delete the local `_sse()` function; import and use `format_sse_event` from `app.server.sse`.

**Update:** `app/server/chat_routes.py` — delete the local `_sse()` function; import and use `format_sse_event` from `app.server.sse`.

**Stop condition:** both route files import from `sse.py`; no local `_sse()` function remains in either file; SSE streams still work end-to-end.

---

### Phase 4: Route-Level Refactoring

> Do not start this phase until Phase 3 stop condition is met.

Extract two duplicated logic blocks into their own modules. Implement in order.

#### 4a — `SessionResolver`

**New file:** `app/server/session_resolver.py`

Extract the auth-check + create-vs-resume + anonymous-fallback logic that currently appears at `routes.py:105-119` and `chat_routes.py:77-91`. The class should expose one async method:

```python
class SessionResolver:
    async def resolve(
        self,
        auth_user: dict | None,
        requested_user_id: str | None,
        requested_session_id: str | None,
        session_title: str = "Untitled Story",
    ) -> tuple[str, str, SessionStore | None, str]:
        """Returns (user_id, session_id, store, decision)."""
        ...
```

Update both route files to instantiate and call `SessionResolver.resolve()` instead of containing the logic inline.

#### 4b — `ADKSessionManager`

**New file:** `app/core/adk_session_manager.py`

Extract the get-or-create ADK session block that currently appears at `routes.py:149-171` and `chat_routes.py:109-125`:

```python
class ADKSessionManager:
    async def ensure_session_exists(self, user_id: str, session_id: str) -> None:
        ...
```

Update both route files to use `ADKSessionManager.ensure_session_exists()`.

**Stop condition:** both route files are meaningfully shorter; duplicated blocks are gone; existing tests pass.

---

### Phase 5: Store Refactoring

> Do not start this phase until Phase 4 stop condition is met.

4 changes to `store.py` and related files. Implement in order.

#### 5a — Extract `_session_doc_ref()` helper

The expression `db.collection("sessions").document(user_id).collection("conversations").document(session_id)` appears 5 times in `store.py`. Extract it into a module-level private function and replace all 5 usages.

#### 5b — Extract `ContextBuilder`

`get_companion_context()`, `get_session_context()`, and `get_previous_context()` share an identical loop structure (iterate interactions, apply limit, filter None, format strings). Extract a shared private method `_format_interaction_lines(interactions, limit, style)` and have all three call it.

#### 5c — Add `get_companion_data()` method

`routes.py` currently calls `get_companion_context()` then `get_companion_title()` sequentially — two Firestore fetches for the same document. Add a `get_companion_data()` method that fetches once and returns `(context, title, brief)`. Update `routes.py` to call it.

#### 5d — Create `SessionQueryService`

**New file:** `app/core/session_query_service.py`

Move the 4 static methods (`list_sessions`, `get_session`, `delete_session`, `update_session_title`) out of `SessionStore` and into a standalone `SessionQueryService` class. Update `session_routes.py` to import from this new module instead of `SessionStore`.

**Stop condition:** `SessionStore` no longer has static query methods; `session_routes.py` imports from `SessionQueryService`; all session REST endpoints still work.

---

### Phase 6: Validation & Style Cleanup

> Do not start this phase until Phase 5 stop condition is met.

5 mechanical changes — no architectural decisions.

| # | File | Action |
|---|------|--------|
| 1 | `routes.py`, `chat_routes.py`, `session_routes.py`, `auth_middleware.py`, `firebase.py` | Replace all `Optional[X]` with `X \| None` |
| 2 | `firebase.py`, tool files, any other logger calls with f-strings | Replace `logger.x(f"... {e}")` with `logger.x("... %s", e)` |
| 3 | `app/server/session_routes.py:22-23` | Add `@field_validator` to `UpdateTitleRequest.title`: strip, min 1 char, max 200 chars |
| 4 | `app/server/routes.py:139` | Move `ELORA_FLUSH_CHARS = 800` to module scope; optionally make it env-configurable via `config.py` |

**Stop condition:** linter passes; no functional changes; existing tests pass.

---

### Phase 7: Test Coverage

> Do not start this phase until Phase 6 stop condition is met.

Add tests for the two most under-covered areas.

#### 7a — `tests/test_chat_routes.py` (new file)

Minimum test cases:
- Companion streams text chunks and a `done` event
- New session is created when no `session_id` is provided
- Existing session is resumed when `session_id` is provided
- User and Elora interactions are logged to Firestore
- `_extract_proposal()` parses a valid `story_proposal` JSON block and returns a dict
- `_extract_proposal()` returns `None` for malformed or missing JSON

#### 7b — `tests/test_store.py` — context method coverage

Add test cases for `get_companion_context()`, `get_session_context()`, and `get_previous_context()`:
- Returns `None` when `_doc_ref` is `None`
- Returns `None` when Firestore document does not exist
- Correctly formats a known list of interactions
- Handles an empty interaction array

**Stop condition:** `pytest` reports all new tests green; coverage on `chat_routes.py` and the three context methods in `store.py` is meaningful.

---

### Phase Overview

| Phase | Items | Type | Risk |
|-------|-------|------|------|
| **1 — Critical bugs** ← START HERE | 2 | Bug fix | Critical |
| 2 — Dead code | 8 | Deletion | Very low |
| 3 — SSE utility | 1 | New file + swap | Low |
| 4 — Route refactor | 2 | Extract classes | Medium |
| 5 — Store refactor | 4 | Extract + split | Medium |
| 6 — Style/validation | 4 | Mechanical | Low |
| 7 — Tests | 2 | New test files | Low |
