# Emotional Chronicler — SOLID Architecture Redesign Plan

> Status: PLANNING  
> Author: Claude Code  
> Date: 2026-04-13

---

## Root Cause: The Image Ordering Bug

**Precise diagnosis:**  
`extract_and_strip_prompts()` extracts ALL image markers from a chunk at once.  
The orchestrator then flushes ALL cleaned text as **one** Firestore `elora` interaction, then logs images sequentially.

Firestore result:  
`[user, elora:"text1 + text2_between_images", tool:img1, tool:img2]`

Frontend reconstruction accumulates ALL `elora` text before any tool flush:  
`→ sections: [text1+text2, img1, img2]`  — images NOT interleaved.

Live SSE shows `text1 → img1 → text2 → img2` ✓  
Saved session shows `text1+text2 → img1 → img2` ✗

**Structural fix:** Split text at image marker boundaries; assign monotonic `seq` number to every event; store as typed event log instead of role-based interaction array.

---

## Target Directory Structure

```
emotional-chronicler/app/
├── domain/                          # NEW — pure data models, no I/O
│   ├── events.py                    # StoryEvent pydantic union (seq, kind, ts)
│   ├── session.py                   # SessionSummary, SessionDetail, SessionStatus
│   └── sections.py                  # StorySection union + events_to_sections()
│
├── services/                        # NEW — orchestration layer
│   ├── stream_orchestrator.py       # ADK→SSE→Firestore pipeline (from routes.py)
│   ├── image_pipeline.py            # Parallel image scheduling, seq-ordered drain
│   ├── title_extractor.py           # Stateful [[TITLE:]] marker accumulator
│   └── companion_context_loader.py  # Loads companion Firestore context
│
├── core/                            # Infrastructure (mostly unchanged)
│   ├── agent.py                     # MODIFY: swap InMemorySessionService → VertexAi
│   ├── store.py                     # MODIFY: add append_event(), create_session_v2()
│   ├── session_query_service.py     # MODIFY: add v2 reader path, expose sections[]
│   ├── visual_engine.py             # unchanged
│   ├── adk_session_manager.py       # unchanged
│   └── firebase.py                  # unchanged
│
├── server/                          # HTTP boundary only
│   ├── routes.py                    # SLIM: ~80 lines, delegates to orchestrator
│   ├── asset_routes.py              # NEW: extracted image/asset serving (~200 lines)
│   ├── chat_routes.py               # unchanged
│   ├── session_routes.py            # unchanged
│   ├── session_resolver.py          # unchanged
│   ├── prompt_parser.py             # MODIFY: add split_text_at_markers()
│   ├── factory.py                   # MODIFY: register asset_routes
│   └── [auth, sse, errors, middleware] # unchanged
│
└── prompts/                         # unchanged (Elora constraint preserved)

frontend-react/src/
├── lib/queryClient.ts               # NEW — React Query QueryClient
├── hooks/
│   ├── useSessionReplay.ts          # NEW — replaces 50-line StoryPage reconstruction
│   └── useSessions.ts               # MODIFY: migrate to React Query
├── pages/StoryPage.tsx              # MODIFY: use useSessionReplay, ~30 lines simpler
├── types/session.ts                 # MODIFY: add StoryEvent union, sections? on detail
└── main.tsx                         # MODIFY: wrap with QueryClientProvider
```

---

## New Firestore Schema (v2)

```
sessions/{user_id}/conversations/{session_id}
{
  schema_version: 2,        ← new field; absence or 1 = legacy path
  title: string,
  status: "active" | "ended",
  created_at: Timestamp,
  updated_at: Timestamp,
  companion_proposal?: {...},   ← unchanged
  events: [                     ← replaces interactions[]
    { seq: 0, kind: "user_prompt",    text: "...",   ts: "..." },
    { seq: 1, kind: "text_segment",   text: "...",   ts: "..." },
    { seq: 2, kind: "image",          image_url, blob_path, image_prompt, mime_type, gcs_ok, ts },
    { seq: 3, kind: "text_segment",   text: "...",   ts: "..." },
    { seq: 4, kind: "image",          ...,           ts: "..." },
    { seq: 5, kind: "text_segment",   text: "...",   ts: "..." },
  ]
}
```

`seq` is the monotonic counter maintained by `StoryStreamOrchestrator`. Reconstruction is `events.sort(seq).map(eventToSection)` — trivial and correct.

---

## Implementation Phases

### Phase 1 — Domain Layer (no behavior change yet)

**Create `app/domain/events.py`:**
```python
SCHEMA_VERSION = 2

class BaseEvent(BaseModel):
    seq: int
    ts: str

class TextSegmentEvent(BaseEvent):
    kind: Literal["text_segment"]
    text: str

class ImageEvent(BaseEvent):
    kind: Literal["image"]
    blob_path: str; image_url: str; image_prompt: str; mime_type: str; gcs_ok: bool = True

class MusicEvent(BaseEvent):
    kind: Literal["music"]
    blob_path: str; audio_url: str; duration_seconds: float

class UserPromptEvent(BaseEvent):
    kind: Literal["user_prompt"]
    text: str

StoryEvent = Annotated[Union[UserPromptEvent, TextSegmentEvent, ImageEvent, MusicEvent],
                       Field(discriminator="kind")]
```

**Create `app/domain/sections.py`:**
```python
def events_to_sections(events: list[StoryEvent]) -> list[StorySection]:
    """Pure function. No I/O. Maps typed events → StorySection[]."""
    sections = []
    for e in sorted(events, key=lambda x: x.seq):
        if e.kind == "text_segment":
            sections.append({"type": "text", "content": e.text})
        elif e.kind == "image":
            sections.append({"type": "image", "url": e.image_url, "caption": ""})
        elif e.kind == "music":
            sections.append({"type": "music", "url": e.audio_url, "duration": e.duration_seconds})
    return sections
```

**Create `app/domain/session.py`:** Pydantic `SessionSummary`, `SessionDetail` models.

### Phase 2 — Image Pipeline (parallel generation + correct splitting)

**Modify `app/server/prompt_parser.py` — add:**
```python
def split_text_at_markers(text: str) -> list[str]:
    """
    Returns N+1 text segments separated by N [[IMAGE_PROMPT:...]] markers.
    Segments may be empty strings. Strips markers from text.
    """
    parts = _IMAGE_PROMPT_RE.split(text)
    # regex split with capturing group returns [text, prompt1, text, prompt2, text, ...]
    texts = parts[0::2]   # every other element is a text segment
    return [t.strip() for t in texts]

def extract_image_prompts(text: str) -> list[str]:
    """Extract just the prompt strings (no stripping from text)."""
    return [m.group(1).strip() for m in _IMAGE_PROMPT_RE.finditer(text)]
```

**Create `app/services/image_pipeline.py`:**
```python
@dataclass
class PendingImage:
    seq: int
    prompt: str
    task: asyncio.Task
    result: tuple[bytes, str] | None = None   # (bytes, mime_type)
    blob_path: str | None = None
    image_url: str | None = None

class ImagePipeline:
    def __init__(self, session_id: str): ...

    def schedule(self, seq: int, prompt: str) -> None:
        """asyncio.create_task(generate_image(prompt)) — non-blocking."""

    async def await_seq(self, seq: int) -> PendingImage | None:
        """Await the task for a specific seq number. Returns None on generation failure."""

    async def drain_all(self) -> AsyncIterator[PendingImage]:
        """Yield all remaining images in seq order. Called at stream end."""

    async def cancel_all(self) -> None:
        """Cancel all pending tasks on exception."""
```

### Phase 3 — StoryStreamOrchestrator (split routes.py)

**Create `app/services/stream_orchestrator.py`:**

The orchestrator owns the core loop extracted from `routes.py:event_stream()`. Key change — when `split_text_at_markers()` returns N+1 text segments and N prompts:

```python
async def _handle_chunk_with_images(
    self, text_segments: list[str], image_prompts: list[str]
):
    """
    Emit: text[0] → image[0] → text[1] → image[1] → ... → text[N]
    Images generated in parallel; emitted in seq order.
    """
    assert len(text_segments) == len(image_prompts) + 1

    for i, prompt in enumerate(image_prompts):
        seq_text  = self._next_seq()
        seq_image = self._next_seq()
        self._pipeline.schedule(seq_image, prompt)

        if text_segments[i].strip():
            await self._flush_text(text_segments[i], seq_text)
            yield format_sse_event({"type": "text", "chunk": text_segments[i]})

        pending = await self._pipeline.await_seq(seq_image)
        if pending and pending.image_url:
            await self._flush_image(pending, seq_image)
            yield format_sse_event({"type": "image", "url": pending.image_url, "caption": ""})

    # trailing text after last image
    seq_tail = self._next_seq()
    if text_segments[-1].strip():
        await self._flush_text(text_segments[-1], seq_tail)
        yield format_sse_event({"type": "text", "chunk": text_segments[-1]})
```

`_flush_text()` calls `store.append_event(TextSegmentEvent(seq=seq_text, text=...))`.  
`_flush_image()` calls `store.append_event(ImageEvent(seq=seq_image, ...))`.

**Create `app/services/title_extractor.py`:** Extract title parsing from `routes.py` lines ~238–298.  
**Create `app/services/companion_context_loader.py`:** Extract companion loading from `routes.py` lines ~340–380.

**Slim `app/server/routes.py` to ~80 lines:**
```python
@api_router.post("/stories")
async def generate_story(request: StoryRequest, http_request: Request):
    auth_user = await get_optional_user(http_request)
    user_id, session_id, store = await SessionResolver().resolve(auth_user, request.session_id, ...)
    ctx = await CompanionContextLoader().load(user_id, request.companion_session_id) if ... else CompanionContext.empty()
    pipeline = ImagePipeline(session_id)
    orchestrator = StoryStreamOrchestrator(runner=runner, store=store, pipeline=pipeline,
                                           title_extractor=TitleExtractor(), session_id=session_id)
    return StreamingResponse(orchestrator.run(ctx.build_prompt(request.prompt), ctx.title, ctx.brief),
                             media_type="text/event-stream", headers={...})
```

**Create `app/server/asset_routes.py`:** Move `serve_asset_image()` and helpers from `routes.py` verbatim.

### Phase 4 — Store v2 + Session Query Service

**Modify `app/core/store.py` — add (keep existing methods):**
```python
def create_session_v2(self, title: str = "Untitled Story") -> str:
    """Creates doc with schema_version=2, events=[]."""

def append_event(self, event: StoryEvent) -> None:
    """ArrayUnion append of one typed event dict."""

def append_events_batch(self, events: list[StoryEvent]) -> None:
    """Single Firestore write for multiple events (used at stream end)."""
```

**Modify `app/core/session_query_service.py`:**
```python
@staticmethod
def get_session(user_id: str, session_id: str) -> dict | None:
    doc_data = ...
    if doc_data.get("schema_version", 1) >= 2:
        return SessionQueryService._read_v2(doc_data, session_id)
    return SessionQueryService._read_v1_legacy(doc_data, session_id)   # existing logic

@staticmethod
def _read_v2(doc_data: dict, session_id: str) -> dict:
    events = [parse_event(e) for e in doc_data.get("events", [])]
    sections = events_to_sections(events)
    return {
        "session_id": session_id, "title": ..., "status": ...,
        "created_at": ..., "updated_at": ...,
        "schema_version": 2,
        "events": [e.model_dump() for e in events],
        "sections": sections,    # ← pre-computed for frontend
    }
```

### Phase 5 — Frontend

**Install React Query:**
```bash
cd frontend-react && npm install @tanstack/react-query
```

**Create `src/lib/queryClient.ts`** — QueryClient with `staleTime: 5min`, `gcTime: 30min`.

**Modify `src/main.tsx`** — wrap with `<QueryClientProvider>`.

**Modify `src/hooks/useSessions.ts`** — replace manual `useState/useEffect` with `useQuery`/`useMutation`.  
Add optimistic updates on rename. Invalidate session list on story complete.

**Create `src/hooks/useSessionReplay.ts`:**
```typescript
export function useSessionReplay(sessionId: string | null) {
  const { data: detail, isLoading } = useSessionDetail(sessionId);
  const sections = useMemo(() => {
    if (!detail) return [];
    if (detail.sections?.length) return detail.sections;            // v2 fast path
    return reconstructLegacySections(detail.interactions ?? []);    // v1 compat
  }, [detail]);
  return { sections, title: detail?.title, isLoading };
}
```

**Modify `src/pages/StoryPage.tsx`** — delete the 50-line `useEffect` reconstruction. Replace with one `useSessionReplay(isLive ? null : id)` call.

**Modify `src/types/session.ts`** — add `StoryEvent` union type; add optional `sections?: StorySection[]` to `SessionDetail`.

### Phase 6 — ADK Session Persistence

**Modify `app/core/agent.py`:**
```python
# Replace:
from google.adk.sessions import InMemorySessionService
_session_service = InMemorySessionService()

# With:
from google.adk.sessions import VertexAiSessionService
_session_service = VertexAiSessionService(project=PROJECT_ID, location=LOCATION)
```

If `VertexAiSessionService` is not yet stable in the installed ADK version, keep `InMemorySessionService` and mark as tech debt. This is the only change needed — `runner` and `companion_runner` both use the shared `_session_service`.

---

## Migration Strategy (Zero Downtime)

| Phase | Action | Backward Compatible? |
|-------|--------|---------------------|
| **Write v2** | New sessions use `schema_version:2` + `events[]` | ✅ Old sessions unchanged |
| **Read both** | `get_session()` checks `schema_version` field | ✅ v1 reader still runs for old docs |
| **Frontend dual** | `useSessionReplay` uses `sections[]` if present, else legacy reconstruction | ✅ Old and new sessions work |
| **Backfill** *(async job, later)* | Convert v1 `interactions[]` → v2 `events[]`, set `schema_version:2` | ✅ Run offline |
| **Cleanup** *(after backfill)* | Delete v1 reader paths | N/A |

---

## SOLID Compliance Summary

| Principle | Fix |
|-----------|-----|
| **S — SRP** | `routes.py` (857→80 lines): pipeline → `StreamOrchestrator`, images → `ImagePipeline`, title → `TitleExtractor`, companion → `CompanionContextLoader`, assets → `asset_routes.py` |
| **O — OCP** | New event kind = add to `StoryEvent` union + one case in `events_to_sections()`. No routes changes. |
| **L — LSP** | `VertexAiSessionService` replaces `InMemorySessionService` — same ADK interface |
| **I — ISP** | `StreamOrchestrator` receives `store.append_event` interface, not the full `SessionStore` object |
| **D — DIP** | `StreamOrchestrator` depends on `ImagePipeline` (abstraction), not `visual_engine.generate_image` (implementation) |

---

## Performance Gains

| Scenario | Before | After |
|----------|--------|-------|
| 4 images (30s each) | 120s sequential | ~30s parallel |
| Sidebar click (cached) | Firestore read + 50-line reconstruction | Instant (React Query cache) |
| Sidebar click (cold) | Firestore read + 50-line reconstruction | Firestore read + `return detail.sections` |
| Cloud Run restart | ADK session lost, story context gone | Session survives (VertexAiSessionService) |
| GCS upload blocking SSE | 1-3s delay per image before SSE event | SSE emitted immediately, GCS runs in background |

---

## Files to Create

| File | LOC (est.) |
|------|-----------|
| `app/domain/__init__.py` | 1 |
| `app/domain/events.py` | 60 |
| `app/domain/session.py` | 40 |
| `app/domain/sections.py` | 50 |
| `app/services/__init__.py` | 1 |
| `app/services/stream_orchestrator.py` | 220 |
| `app/services/image_pipeline.py` | 100 |
| `app/services/title_extractor.py` | 80 |
| `app/services/companion_context_loader.py` | 60 |
| `app/server/asset_routes.py` | 200 |
| `frontend-react/src/lib/queryClient.ts` | 15 |
| `frontend-react/src/hooks/useSessionReplay.ts` | 60 |

## Files to Modify

| File | What Changes |
|------|-------------|
| `app/server/routes.py` | Strip to 80 lines — delegate everything |
| `app/server/factory.py` | Register `asset_routes.router` |
| `app/server/prompt_parser.py` | Add `split_text_at_markers()`, `extract_image_prompts()` |
| `app/core/store.py` | Add `create_session_v2()`, `append_event()`, `append_events_batch()` |
| `app/core/session_query_service.py` | Add v2 reader, keep v1 legacy |
| `app/core/agent.py` | Swap session service (if ADK supports it) |
| `frontend-react/src/main.tsx` | Add `QueryClientProvider` |
| `frontend-react/src/hooks/useSessions.ts` | Migrate to React Query |
| `frontend-react/src/pages/StoryPage.tsx` | Delete 50-line reconstruction useEffect |
| `frontend-react/src/types/session.ts` | Add `StoryEvent`, `sections?` on `SessionDetail` |

---

## Verification

1. **Generate a new story** → images appear interleaved with text during live SSE ✓
2. **Reload the page** (same session from sidebar) → images appear at exact same narrative positions ✓
3. **Open an old (v1) session** → renders via legacy reconstruction path, no regression ✓
4. **Click same session twice** → second click is instant (React Query cache) ✓
5. **Rename a session in sidebar** → optimistic update shows immediately ✓
6. **Kill and restart backend** → saved sessions still load (Firestore is source of truth) ✓
7. **Generate story with 4 images** → total image time ≈ slowest single image, not sum ✓
