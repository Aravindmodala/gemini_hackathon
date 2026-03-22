# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Emotional Chronicler** — an AI-powered interactive storytelling app for Google's hackathon (Creative Storyteller category). A user submits a story prompt; the backend streams back interleaved text prose, Imagen 4 scene illustrations, and Lyria 2 atmospheric music via SSE (Server-Sent Events).

**Stack:** FastAPI backend (Google ADK + Gemini 3.1 Pro Preview) + React 19 / Vite / TypeScript frontend.

## Running the App

**Backend:**
```bash
cd emotional-chronicler
pip install -r requirements.txt
uvicorn main:app --port 3001 --reload
```
Requires a `.env` file with `GOOGLE_CLOUD_PROJECT` and valid Application Default Credentials (ADC).

**Frontend (dev):**
```bash
cd frontend-react
npm install
npm run dev    # http://localhost:5173
```

**Production build** (backend serves `dist/` as static files at `/`):
```bash
cd frontend-react && npm run build
```

## Commands

**Frontend:**
```bash
npm run lint            # ESLint
npm run test            # Vitest (single run)
npm run test:watch      # Vitest watch mode
npm run test:coverage   # Coverage report
npm run test:e2e        # Playwright E2E
```

**Backend manual test:**
```bash
curl -X POST http://localhost:3001/api/story \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A short magical fantasy story"}' --no-buffer
```

## Architecture

### Data Flow
```
Browser → POST /api/story (SSE)
       → FastAPI (routes.py)
       → Google ADK Runner (agent.py)
       → Elora Agent (Gemini 3.1 Pro Preview)
            ├─ generate_image() → Imagen 4 → PNG cached in _image_cache/
            └─ generate_music() → Lyria 2 (Vertex AI REST) → WAV cached in _music_cache/

Static assets served:
  GET /api/images/{filename}  → _image_cache/
  GET /api/music/{filename}   → _music_cache/
  GET /api/sessions/*         → Firestore session CRUD
  GET /                       → frontend-react/dist/index.html
```

### Backend (`emotional-chronicler/`)
- **`app/config.py`** — Config singleton: env vars, model names, GenAI client, cache dir paths.
- **`app/core/agent.py`** — ADK `elora_agent` definition with `generate_image` and `generate_music` tools; `runner` for SSE execution.
- **`app/core/store.py`** — `SessionStore`: Firestore-backed session create/resume/log/context.
- **`app/server/routes.py`** — Main HTTP routes including SSE story generation endpoint.
- **`app/server/factory.py`** — FastAPI app factory: middleware, route registration, lifespan.
- **`app/prompts/elora.py`** — System prompt for the Elora novelist persona. **Key constraint:** agent must NEVER ask the reader questions (enforced 5× in the prompt).
- **`app/tools/imagen.py`** — `generate_image(scene_description, style)` ADK tool.
- **`app/tools/lyria.py`** — `generate_music(prompt, negative_prompt)` ADK tool via Vertex AI REST.

### Frontend (`frontend-react/src/`)
- **`hooks/useStoryteller.ts`** — Core hook: `startStory(prompt)` → POSTs to `/api/story` → parses SSE events → accumulates `text`/`image`/`music` sections into state.
- **`hooks/useSessions.ts`** — REST calls to `/api/sessions/*` for session list/detail/delete/rename.
- **`components/BookView.tsx`** — Renders interleaved story sections (prose, 16:9 images, music badges).
- **`components/StoryPrompt.tsx`** — Textarea + submit (Cmd+Enter) + 6 genre chips.
- **`components/AvatarHUD.tsx`** — Status orb (generating/done/error), Stop button, New Story button.
- **`components/Scene.tsx`** — Three.js 3D decorative background (unchanged from prior version).
- **`contexts/AuthContext.tsx`** — Firebase auth provider (`user`, `getIdToken`, `signOut`).
- **`store/useAvatarStore.ts`** — Zustand store for 3D avatar animation state.

## Environment Variables

```bash
GOOGLE_CLOUD_PROJECT=<gcp-project-id>
GOOGLE_CLOUD_LOCATION=us-central1          # default
FIREBASE_ENABLED=true                      # set false to skip auth in dev
PORT=3000                                   # default (override to 3001 in dev)

# Optional model overrides (defaults shown)
STORY_MODEL=gemini-3.1-pro-preview
IMAGEN_MODEL=imagen-4.0-generate-001
```

## Key Constraints & Gotchas

- **Elora must never ask questions** — this is deeply intentional in the prompt design; do not weaken this constraint.
- **ADK package version** — project uses `google-adk>=0.4.0`; verify import paths match this version before making changes to `agent.py`.
- **SSE event format** — `useStoryteller.ts` parses a specific SSE event structure from the ADK runner; changes to backend event emission must stay in sync.
- **Cache dirs** — `_image_cache/` and `_music_cache/` are auto-created by `config.py`; files are served directly by filename. No cleanup runs automatically.
- **CORS** — currently open (`allow_origins=["*"]`); do not tighten in dev without updating Vite proxy config.
- **Vite proxy** — check `vite.config.ts` for `/api` proxy to backend; if missing, add it for local dev.
- **`short.md`** — outdated handoff doc describing the old Gemini Live API / WebSocket architecture. Ignore it; the project has fully migrated to ADK + SSE.
- **`repo_info.md`** — up-to-date comprehensive project guide with known issues and TODO list. Read it for full context before making significant changes.
