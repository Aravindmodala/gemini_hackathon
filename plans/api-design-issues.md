# API Design Issues — Emotional Chronicler Backend

> Reviewed: 2026-03-22
> Scope: `emotional-chronicler/app/server/routes.py`, `session_routes.py`, `middleware.py`

---

## Endpoints Audited

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/story` | Start SSE story generation |
| `GET` | `/api/images/{filename}` | Serve generated image |
| `GET` | `/api/music/{filename}` | Serve generated music |
| `GET` | `/api/sessions` | List user sessions |
| `GET` | `/api/sessions/{session_id}` | Get single session |
| `DELETE` | `/api/sessions/{session_id}` | Delete session |
| `PATCH` | `/api/sessions/{session_id}` | Rename session |

---

## 🔴 Critical

### 1. No API Versioning
**File:** `factory.py` — all routers
All routes lack a version prefix. Any breaking change to the contract immediately breaks all existing clients.

```
# Current
POST /api/story
GET  /api/sessions

# Required
POST /api/v1/story
GET  /api/v1/sessions
```

**Fix:** Add `prefix="/api/v1"` to all routers in `factory.py`.

---

### 2. Resource Name is Singular — `/api/story`
**File:** `routes.py:47`
REST convention requires plural nouns for resource collections. `/api/story` violates this.

```
# Bad (current)
POST /api/story

# Good
POST /api/v1/stories
```

---

### 3. `DELETE` Returns 200 with Body Instead of 204
**File:** `session_routes.py:48`
`DELETE` on a resource must return `204 No Content` with no body on success.

```python
# Current
return {"status": "deleted"}  # 200 OK

# Fix
from fastapi import Response

@router.delete("/{session_id}", status_code=204)
async def delete_session(...):
    ...
    return Response(status_code=204)
```

---

### 4. Non-Standard Response Envelope
**File:** `session_routes.py`, `routes.py`
Three different response shapes are returned with no consistency:

```json
// GET /api/sessions — "sessions" key
{ "sessions": [...] }

// GET /api/sessions/{id} — flat, no wrapper
{ "session_id": "...", "title": "...", "interactions": [...] }

// DELETE
{ "status": "deleted" }

// PATCH
{ "status": "updated" }
```

**Fix — standardize to a `data` envelope:**
```json
// Collections
{ "data": [...] }

// Single resource
{ "data": { "session_id": "...", "title": "..." } }

// DELETE → 204 No Content (no body)

// PATCH → updated resource
{ "data": { "session_id": "...", "title": "New Title" } }
```

---

### 5. Non-Standard Error Format
**File:** `session_routes.py`, `routes.py`
Three different error shapes exist in the same API:

```json
// FastAPI default (HTTP errors)
{ "detail": "Session not found" }

// SSE error events
{ "type": "error", "message": "..." }

// Standard (missing — should be)
{ "error": { "code": "not_found", "message": "Session not found" } }
```

**Fix:** Define one Pydantic error model and use it for all HTTP errors via a custom exception handler.

---

## 🟠 High Priority

### 6. No Pagination on `GET /api/sessions`
**File:** `session_routes.py:19`, `store.py:332`
`list_sessions()` returns every session for a user with no `limit`, `page`, or cursor. A user with many sessions gets all of them in one unbounded response.

**Fix:**
```
GET /api/v1/sessions?limit=20&cursor=<opaque_cursor>
```
Firestore supports cursor-based pagination natively via `.start_after()`.

---

### 7. No `Location` Header on Story/Session Creation
**File:** `routes.py:195–201`
When `POST /api/story` resolves a `session_id`, it emits it as the first SSE event. REST convention also requires a `Location` response header.

```python
# Fix — add to StreamingResponse headers
headers={
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Location": f"/api/v1/sessions/{session_id}",
}
```

---

### 8. Session Resume via Request Body Instead of Path Parameter
**File:** `routes.py:41–44`
Putting `session_id` in the POST body to resume a session violates resource-oriented design. Existing resources should be identified in the URL.

```python
# Current — session_id in body
class StoryRequest(BaseModel):
    prompt: str
    user_id: Optional[str] = None      # unnecessary (auth provides it)
    session_id: Optional[str] = None   # wrong place for resource ID
```

**Better URL design:**
```
POST /api/v1/stories                        # new story
POST /api/v1/sessions/{session_id}/stories  # continue existing session
```

---

### 9. No Rate Limiting on Expensive Endpoints
**File:** `routes.py:47`, `middleware.py`
`POST /api/story` calls Imagen 4, Lyria 2, and Gemini — all billable, slow external APIs. There is zero rate limiting. An unauthenticated user can hammer this endpoint indefinitely.

**Fix:** Add `slowapi` or a token-bucket middleware with per-IP limits:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
Retry-After: 60
```

---

### 10. Static File Routes Mixed Under `/api/`
**File:** `routes.py:212–230`
```
GET /api/images/{filename}
GET /api/music/{filename}
```
Binary asset endpoints should not share the same prefix as REST API resources. Either mount them as true static directories or clearly separate them.

---

## 🟡 Lower Priority

### 11. `PATCH` Should Return the Updated Resource
**File:** `session_routes.py:62`
`PATCH` currently returns `{"status": "updated"}`. It should return the updated resource so the client doesn't need a follow-up `GET`.

```json
{
  "data": {
    "session_id": "abc123",
    "title": "The Dragon's Lair",
    "updated_at": "2026-03-22T10:00:00Z"
  }
}
```

---

### 12. `GET /api/sessions/{session_id}` Returns Full `interactions` Array Unpaginated
**File:** `session_routes.py:28`, `store.py:363`
For long sessions the `interactions` array could be megabytes. Should paginate or offer opt-in via `?include=interactions`.

---

### 13. No OpenAPI Documentation on Routes
**File:** `routes.py`
Story, image, and music routes have no `response_model`, `summary`, `tags`, or documented response schemas. The auto-generated `/docs` is nearly empty for the core endpoints.

```python
# Fix
@router.post(
    "/api/v1/stories",
    summary="Generate an illustrated story via SSE",
    response_class=StreamingResponse,
    responses={200: {"description": "SSE stream of story events"}},
    tags=["stories"],
)
```

---

## Full Checklist Score

| Criterion | Status |
|-----------|--------|
| Resource URLs: plural, kebab-case, no verbs | ⚠️ `/api/story` is singular |
| API versioning | ❌ Missing entirely |
| Correct HTTP methods | ✅ Correct |
| Appropriate status codes | ⚠️ DELETE returns 200, should be 204 |
| Input validation with schema | ⚠️ `StoryRequest` has no field constraints |
| Standard error response format | ❌ 3 different shapes |
| Pagination on list endpoints | ❌ Missing on `GET /api/sessions` |
| Authentication required or explicit | ✅ Done correctly |
| Authorization: user owns resource | ✅ Done correctly |
| Rate limiting | ❌ Missing entirely |
| No internal details in errors | ❌ `str(e)` leaked in SSE errors |
| Consistent response envelope | ❌ 3 different shapes |
| `Location` header on creation | ❌ Missing |
| OpenAPI/Swagger documented | ⚠️ Partial (sessions have `tags`, rest do not) |

---

## Priority Fix Order

1. Add `/api/v1/` versioning — low effort, high impact
2. Standardize error format — one Pydantic error model used everywhere
3. Fix DELETE → 204 No Content
4. Standardize response envelope to `{"data": ...}`
5. Add pagination to `GET /api/sessions`
6. Add rate limiting to `POST /api/story`
7. Rename `/api/story` → `/api/v1/stories`
