# Backend & Coding Standards Issues — Emotional Chronicler

> Reviewed: 2026-03-22
> Scope: All files under `emotional-chronicler/`

---

## Overall Assessment

The architecture is solid: clean module separation, consistent logging, graceful degradation pattern (Firestore/Firebase), proper FastAPI factory and lifespan, and good docstrings throughout. The issues below are improvements on an otherwise well-structured codebase.

---

## 🔴 Critical

### 1. Blocking I/O Inside Async Function — `lyria.py:144, 232`
`urllib.request.urlopen` is **synchronous** and blocks the entire asyncio event loop. Every music generation call (~30s) freezes all concurrent requests.

```python
# Current — blocks event loop
with urllib.request.urlopen(req, timeout=120) as response:
    result = json.loads(response.read().decode("utf-8"))
```

**Fix:** Replace with `httpx.AsyncClient`:
```python
async with httpx.AsyncClient(timeout=120) as client:
    response = await client.post(url, json=payload, headers=headers)
    result = response.json()
```

---

### 2. Blocking Firestore Calls in Async Routes — `session_routes.py`
`SessionStore.list_sessions()`, `get_session()`, `delete_session()`, and `update_session_title()` use the synchronous `google-cloud-firestore` client. Called from `async` route handlers, they block the event loop on every session API request.

**Fix:** Either wrap in `asyncio.get_event_loop().run_in_executor(None, ...)`, or switch to the async Firestore client (`google.cloud.firestore_v1.async_client.AsyncClient`).

---

### 3. Path Traversal Vulnerability — `routes.py:215, 225`
`filename` is a user-supplied string used directly in a file path with no validation. A request like `GET /api/images/../../.env` could expose arbitrary files.

```python
# Current — unsafe
path = IMAGE_CACHE_DIR / filename
```

**Fix:** Validate the resolved path is inside the cache directory:
```python
path = (IMAGE_CACHE_DIR / filename).resolve()
if not path.is_relative_to(IMAGE_CACHE_DIR.resolve()):
    raise HTTPException(status_code=400, detail="Invalid filename")
```

---

### 4. CORS Misconfiguration — `middleware.py:10`
`allow_origins=["*"]` combined with `allow_credentials=True` is rejected by browsers (the CORS spec forbids this combination) and FastAPI/Starlette will log a warning at startup.

```python
# Current — broken in browsers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,  # ← incompatible with wildcard
    ...
)
```

**Fix:** Either enumerate explicit origins or drop `allow_credentials`:
```python
allow_origins=["http://localhost:5173", "https://your-production-domain.com"],
allow_credentials=True,
```

---

## 🟠 High Priority

### 5. Internal Error Details Leaked to Clients — `routes.py:193`
```python
yield _sse({"type": "error", "message": str(e)})
```
`str(e)` can expose stack traces, internal paths, GCP project IDs, and model names to the browser.

**Fix:** Log the full exception server-side; return a safe generic message to the client:
```python
logger.exception("[Story] stream_failure ...", user_id, session_id, e)
yield _sse({"type": "error", "message": "Story generation failed. Please try again."})
```

---

### 6. `sys.exit(1)` Inside App Factory — `factory.py:30`
```python
if not PROJECT_ID:
    logger.error("ERROR: Set GOOGLE_CLOUD_PROJECT environment variable.")
    sys.exit(1)
```
Calling `sys.exit` inside a library function kills the process without allowing cleanup, makes unit testing impossible, and is a bad pattern for a factory function.

**Fix:**
```python
if not PROJECT_ID:
    raise RuntimeError("GOOGLE_CLOUD_PROJECT environment variable is not set.")
```
Let `main.py` catch and exit cleanly.

---

### 7. No Input Validation on `StoryRequest.prompt` — `routes.py:41`
An empty, whitespace-only, or 50,000-character prompt goes straight to the ADK agent with no validation.

**Fix:**
```python
from pydantic import Field

class StoryRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000, strip_whitespace=True)
    session_id: Optional[str] = None
```

---

### 8. `PATCH /{session_id}` Missing 404 Check — `session_routes.py:51`
`DELETE` correctly checks existence before acting and returns 404. `PATCH` does not — a missing session returns 500 instead of 404.

**Fix:** Add the same existence check as in `delete_session` before calling `update_session_title`.

---

## 🟡 Code Quality

### 9. Dead Code: `LyriaTool` and `BaseTool` — `lyria.py`, `tools/base.py`
`LyriaTool` subclasses `BaseTool` and implements music generation, but it is **never used**. The ADK only uses the standalone `generate_music()` function. Both `LyriaTool` and `BaseTool` (and `tools/base.py`) are dead code.

**Fix:** Delete `LyriaTool`, `BaseTool`, and `app/tools/base.py`.

---

### 10. `import` Statements Inside Function Bodies — `routes.py`, `lyria.py`
```python
# routes.py:60 — inside route handler
from google.genai import types as genai_types

# routes.py:217, 227 — inside endpoint
from fastapi import HTTPException

# lyria.py:132, 240 — inside async function
import urllib.request
import base64
```
Imports inside functions are re-executed conceptually on every call and confuse static analysis tools and linters.

**Fix:** Move all imports to module top level.

---

### 11. f-strings in `logger.*` Calls — widespread
```python
# Current — string always built regardless of log level
logger.warning(f"[Store] Firestore unavailable: {e}")
logger.info(f"[Agent] Elora ADK agent ready — model: {STORY_MODEL}")
```

**Fix — use `%`-style lazy formatting:**
```python
logger.warning("[Store] Firestore unavailable: %s", e)
logger.info("[Agent] Elora ADK agent ready — model: %s", STORY_MODEL)
```
This is consistent with the structured logging already used in some places (e.g., `routes.py:63–67`).

---

### 12. `LYRIA_MODEL` Defined Twice — `config.py:39`, `lyria.py:24`
The same constant `"lyria-002"` is defined in both files. They can silently diverge.

**Fix:** Delete `LYRIA_MODEL` from `lyria.py:24` and import it from `app.config`.

---

### 13. Truncated UUID Session IDs — `store.py:77`
```python
self.session_id = uuid.uuid4().hex[:12]  # only 12 of 32 chars
```
12 hex chars = 48 bits of entropy, giving ~1 in 281 trillion collision chance. Fine for a hackathon but not for production.

**Fix:** Use the full `uuid.uuid4().hex` (32 chars, 128 bits).

---

### 14. Hardcoded Magic Number `33` — `lyria.py:164, 259`
```python
"duration_seconds": 33,  # never computed from actual audio
```
The value is never derived from the actual audio content. At minimum, name it:
```python
LYRIA_TRACK_DURATION_SECONDS = 33
```

---

### 15. Dead File — `app/core/auth.py`
The file contains only a module docstring and zero code. It exists as an empty placeholder.

**Fix:** Delete it.

---

### 16. Dead Constant — `config.py:36`
```python
GEMINI_LIVE_MODEL = "gemini-live-2.5-flash-native-audio"   # legacy Live API route
```
Nothing in the codebase references this constant. It's a leftover from the old WebSocket architecture.

**Fix:** Delete it.

---

### 17. No Response Models on Routes — `session_routes.py`, `routes.py`
No route declares a `response_model`, which means:
- FastAPI can't auto-validate response payloads
- OpenAPI schema generation is incomplete
- IDE type checking can't follow the response shape

**Fix:** Define Pydantic response models and annotate all routes:
```python
class SessionSummary(BaseModel):
    session_id: str
    title: str
    status: str
    created_at: Optional[str]
    updated_at: Optional[str]
    interaction_count: int
    preview: str

class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]

@router.get("", response_model=SessionListResponse)
async def list_sessions(...):
```

---

### 18. `get_optional_user` Called Manually Instead of via `Depends` — `routes.py:69`
```python
auth_user = await get_optional_user(http_request)
```
This bypasses FastAPI's dependency injection system. It works, but is inconsistent with how `get_current_user` is used in `session_routes.py` via `Depends`.

**Fix:**
```python
@router.post("/api/v1/stories")
async def generate_story(
    request: StoryRequest,
    auth_user: Optional[dict] = Depends(get_optional_user),
):
```

---

### 19. Side Effects at Import Time — `config.py`
`config.py` runs `mkdir`, sets env vars, and instantiates `genai.Client()` when the module is first imported. Any test that imports `app.config` triggers GCP client initialization, requiring credentials.

**Fix:** Wrap `genai_client` in a lazy accessor:
```python
_genai_client = None

def get_genai_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)
    return _genai_client
```

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | 🔴 Critical | `lyria.py:144,232` | Blocking `urllib` inside `async` — blocks event loop |
| 2 | 🔴 Critical | `session_routes.py` | Sync Firestore calls block async event loop |
| 3 | 🔴 Critical | `routes.py:215,225` | Path traversal on user-supplied filename |
| 4 | 🔴 Critical | `middleware.py:10` | CORS wildcard + credentials rejected by browsers |
| 5 | 🟠 High | `routes.py:193` | `str(e)` error detail leaked to client |
| 6 | 🟠 High | `factory.py:30` | `sys.exit(1)` inside app factory |
| 7 | 🟠 High | `routes.py:41` | No input validation on `StoryRequest.prompt` |
| 8 | 🟠 High | `session_routes.py:51` | PATCH missing 404 existence check |
| 9 | 🟡 Medium | `lyria.py`, `tools/base.py` | `LyriaTool`/`BaseTool` are dead code |
| 10 | 🟡 Medium | `routes.py`, `lyria.py` | Imports inside function bodies |
| 11 | 🟡 Medium | multiple | f-strings in `logger.*` calls |
| 12 | 🟡 Medium | `lyria.py:24`, `config.py:39` | `LYRIA_MODEL` defined twice |
| 13 | 🟡 Medium | `store.py:77` | Truncated UUID session IDs (12 of 32 chars) |
| 14 | 🟡 Low | `lyria.py:164,259` | Magic number `33` never computed from audio |
| 15 | 🟡 Low | `app/core/auth.py` | Empty dead file |
| 16 | 🟡 Low | `config.py:36` | Dead `GEMINI_LIVE_MODEL` constant |
| 17 | 🟡 Low | `session_routes.py`, `routes.py` | No `response_model` on any route |
| 18 | 🟡 Low | `routes.py:69` | `get_optional_user` called manually, not via `Depends` |
| 19 | 🟡 Low | `config.py` | Side effects (GCP client init) at import time |

---

## Recommended Fix Order

**Immediate (correctness & security):**
1. Fix blocking I/O in `lyria.py` — replace `urllib` with `httpx`
2. Fix path traversal in file-serving routes
3. Fix CORS misconfiguration
4. Wrap Firestore calls in `run_in_executor` or use async client

**Short-term (robustness):**
5. Sanitize error messages sent to clients
6. Replace `sys.exit` with `RuntimeError` in factory
7. Add Pydantic field constraints to `StoryRequest`
8. Add 404 check to PATCH route

**Cleanup (code quality):**
9. Delete `LyriaTool`, `BaseTool`, `auth.py`, `GEMINI_LIVE_MODEL`
10. Move all imports to module top level
11. Switch logger calls to `%`-style formatting
12. Deduplicate `LYRIA_MODEL`
13. Add `response_model` to all routes
14. Refactor `config.py` to lazy-initialize `genai_client`
