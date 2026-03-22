# The Emotional Chronicler — Handoff Summary

Short overview of what is implemented and how the project works, for handoff to other agents or developers.

---

## What This Project Is

A **real-time voice-driven AI storyteller** for the Google Hackathon. Users talk to **Elora** (a novelist persona) over WebSocket. The backend uses the **Google GenAI SDK** to connect to **Gemini Live API** (native audio). Elora can tell stories and, during storytelling only, trigger **Lyria 2** to generate background music. The frontend is a React + Three.js app with a 3D avatar, lip-sync, and session management (Firebase auth, Firestore-backed session list).

---

## What Is Implemented

### Backend (emotional-chronicler)

- **GenAI SDK migration (complete)**  
  - Gemini Live is accessed via `google-genai` (`client.aio.live.connect()`), not raw WebSockets.  
  - Config: `app/config.py` — `genai_client` singleton, `GEMINI_LIVE_MODEL`, `PROJECT_ID`, `LOCATION`.  
  - No manual `get_access_token()`; SDK uses ADC.

- **Session lifecycle** (`app/core/session.py`)  
  - `GeminiSession(client_ws, user_id, session_id)` — one per browser WebSocket.  
  - Builds system prompt (with optional Firestore memory), creates LiveConnectConfig (voice Aoede, tools, transcription), runs bidirectional relay inside `async with genai_client.aio.live.connect(...)`.

- **Relay** (`app/core/relay.py`)  
  - **Gemini → client:** Audio (base64), transcripts (user + Elora), status (turn_complete, interrupted), tool_event, music (URL only).  
  - **Client → Gemini:** Audio (PCM 16 kHz), images via `send_realtime_input`.  
  - Tool calls: dispatch to `ToolRegistry`, send music to browser via **HTTP URL** (WAV saved under `_music_cache/`, served at `/api/music/{filename}`), then `send_tool_response` back to Gemini.  
  - All client sends go through `_safe_send()` to avoid crashes when the browser has disconnected.

- **Tools**  
  - **LyriaTool** (`app/tools/lyria.py`): `generate_music(prompt, negative_prompt)` → Vertex AI Lyria 2 predict → returns base64 WAV (and metadata). Used only during **storytelling** (gated by system prompt + tool description).  
  - **GoogleSearchTool** exists but is **excluded** from Live API tools (`get_declarations(exclude_builtin=True)`) because the API does not allow mixing `googleSearch` with `functionDeclarations`.  
  - ToolRegistry auto-discovers tools and provides `get_declarations(exclude_builtin=True)` and `dispatch(name, **kwargs)`.

- **Elora system prompt** (`app/prompts/elora.py`)  
  - Defines conversation vs storytelling modes, voice rules, and a **TOOLS** section: use `generate_music` only in storytelling mode, at scene/mood changes, not for small talk or user emotions in conversation.

- **Auth & API**  
  - Firebase ID token in WebSocket query (`?token=...`) for authenticated users; `session_id` for resume.  
  - Routes: `GET /`, `GET /api/music/{filename}`, `WS /ws`. Session CRUD under `/api/sessions` (see `session_routes.py`).

- **Firestore**  
  - `SessionStore` (app/core/store.py) used when `user_id` is present: create/resume session, log interactions and tool calls, end session. Memory can be appended to system prompt for resume/context.

### Frontend (frontend-react)

- **Auth:** Firebase (AuthContext), sign-in; optional `getIdToken` and `sessionId` passed to WebSocket.
- **Sessions:** Sidebar with session list (useSessions), create/select/delete/rename; active session sent as `session_id` on connect.
- **Storyteller hook** (`useStoryteller.ts`): WebSocket to backend; sends `audio` (base64 PCM 16 kHz) and `image`; receives `status`, `audio` (24 kHz playback + lip-sync), `transcript`, `tool_event`, `music` (URL only — fetches WAV via HTTP and plays with Web Audio API), `session_info`, `error`.
- **3D avatar:** Scene, Avatar (lip-sync, emotions), AvatarHUD (talk button, status), PostFX. Zustand store for action, emotion, lipSyncVolume.

### Scripts & Tests

- **test_lyria.py** — Standalone script: prompt for music description, call Lyria API, save WAV and open HTML player. Proves Lyria pipeline without the app.
- **test_genai_live.py** — Spike for GenAI SDK: connect to Live API, text→audio, tool declaration format, tool_call → FunctionResponse → continuation. Used to validate SDK before migration.

---

## How to Run

- **Backend:** `cd emotional-chronicler && uvicorn main:app --port 3001 --reload`  
  Requires `.env`: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `PORT`; ADC for GCP.
- **Frontend (dev):** `cd frontend-react && npm run dev` (e.g. http://localhost:5173).  
  For production, `npm run build` and serve `frontend-react/dist` (backend serves it at `GET /` when built).
- **WebSocket:** `ws://localhost:3001/ws?token=<firebase_id_token>` (and optionally `&session_id=...`).

---

## Key Files for Handoff

| Area | File | Purpose |
|------|------|--------|
| Backend entry | `emotional-chronicler/main.py` | Creates FastAPI app |
| Config | `emotional-chronicler/app/config.py` | `genai_client`, GEMINI_LIVE_MODEL, PROJECT_ID, LOCATION |
| Session | `emotional-chronicler/app/core/session.py` | GeminiSession, LiveConnectConfig, relay orchestration |
| Relay | `emotional-chronicler/app/core/relay.py` | Gemini↔client message handling, tool dispatch, music URL |
| Tools | `emotional-chronicler/app/tools/lyria.py`, `__init__.py` | Lyria tool, ToolRegistry, get_declarations(exclude_builtin=True) |
| Prompt | `emotional-chronicler/app/prompts/elora.py` | Full Elora system prompt including TOOLS rules |
| Routes | `emotional-chronicler/app/server/routes.py` | `/`, `/api/music/{filename}`, `/ws` |
| Frontend WS | `frontend-react/src/hooks/useStoryteller.ts` | WebSocket send/receive, audio playback, music URL fetch |

---

## Gaps / Not Done

- **Interleaved output (Creative Storyteller):** Hackathon required “Gemini’s interleaved/mixed output” (e.g. text + generated images in one stream). Current flow is Live API voice + Lyria music via tool call. No native “generateContent with responseModalities TEXT+IMAGE” for inline story illustrations yet.
- **Image generation tool:** No Imagen (or other) image tool wired; only Lyria is active.
- **Music cache cleanup:** `_music_cache/` is written but never pruned; consider TTL or size-based cleanup.
- **repo_info.md:** Still describes the old raw-WebSocket architecture; should be updated to reflect GenAI SDK and current relay/tool flow.

---

## Hackathon Compliance

- **Mandatory tech:** “Agents must be built using either Google GenAI SDK OR ADK” — satisfied via `google-genai` and `client.aio.live.connect()`.
- **Hosted on Google Cloud:** App is designed to run on GCP (e.g. Cloud Run); not yet deployed in this repo.
- **Creative Storyteller:** Real-time voice + music during storytelling is implemented; interleaved text+image generation is the main missing piece for full category fit.
