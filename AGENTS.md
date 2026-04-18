# Repository Guidelines

## Project Structure & Module Organization

**Emotional Chronicler** is a FastAPI + React 19 app that streams interleaved prose, Imagen 4 images, and Lyria 2 music via SSE (Server-Sent Events).

The backend uses a two-model pipeline introduced in the latest `feat: Power Couple` commit:
- `NARRATIVE_MODEL` (Elora agent, `gemini-3.1-flash-lite-preview`) — drives story prose
- `VISUAL_MODEL` (`gemini-3-pro-image-preview`) — decoupled image generation via `visual_engine.py`

ADK session state lives in `InMemorySessionService` (sessions lost on restart); Firestore-backed service exists but is not yet wired to the runner. GCS is the persistent store for images/music; local `_image_cache/` and `_music_cache/` are auto-created by `config.py`.

SSE event format is a contract between `app/server/routes.py` (emission) and `frontend-react/src/hooks/useStoryteller.ts` (parsing). Any change to event structure must be reflected in both.

## Build, Test, and Development Commands

**Backend:**
```bash
cd emotional-chronicler
pip install -r requirements.txt
uvicorn main:app --port 3001 --reload
```

**Frontend (dev):**
```bash
cd frontend-react
npm install
npm run dev          # http://localhost:5173 — proxies /api to :3001
npm run build        # tsc -b && vite build (backend serves dist/ in prod)
```

**Frontend tests:**
```bash
npm run lint         # ESLint 9 flat config
npm run test         # Vitest single run
npm run test:watch   # Vitest watch
npm run test:coverage
npm run test:e2e     # Playwright (auto-starts dev server on :5173)
```

**Smoke test the backend:**
```bash
curl -X POST http://localhost:3001/api/story \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A short magical fantasy story"}' --no-buffer
```

## Coding Style & Naming Conventions

**TypeScript (strict):** `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`. Target ES2022, module resolution `bundler`.

**ESLint:** Flat config (`eslint.config.js`). Extends `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`. Applied to `**/*.{ts,tsx}` only.

**Python:** No linter config enforced. Follow existing module boundaries — routes in `app/server/`, business logic in `app/core/`, ADK tools in `app/tools/`, prompts in `app/prompts/`.

## Testing Guidelines

**Unit/component:** Vitest + jsdom + React Testing Library. Tests live in `src/**/__tests__/` and alongside components as `*.test.tsx`. Run a single file: `npx vitest run src/path/to/file.test.tsx`.

**E2E:** Playwright in `frontend-react/e2e/`, targets Chromium desktop, base URL `http://localhost:5173`. Retries 2× in CI, 0× locally.

## Key Constraints

- **Elora must never ask the reader questions** — this is enforced 5× in `app/prompts/elora.py`. Do not weaken it.
- **ADK version** — `google-adk>=0.4.0`; verify import paths match the installed version before touching `agent.py`.
- **`short.md`** — describes the old WebSocket/Gemini Live API architecture. Ignore it entirely.
- **CORS** — `middleware.py` is currently open (`allow_origins=["*"]`). Do not tighten without also updating the Vite `/api` proxy.

## Commit Guidelines

Follow Conventional Commits as seen in history: `feat:`, `fix:`, `feat(scope):`, `fix(scope):`. Use lowercase imperative descriptions. Include scope in parentheses when the change is isolated to one layer (e.g., `feat(frontend):`, `fix(backend):`).
