---
name: Security Patterns — Gemini Storyteller Frontend
description: Recurring security patterns, trust boundaries, and known risks in the frontend React codebase
type: project
---

Auth enforcement happens in AuthContext.tsx (`getIdToken` wraps Firebase SDK). All API hooks (useStoryteller, useCompanionChat, useSessions) accept `getIdToken` and pass Bearer tokens. FIREBASE_ENABLED=false is a dev-only backend toggle — frontend always requires a real Firebase user.

**Why:** Auth is client-enforced at the hook layer, not a middleware layer, so any new hook or direct fetch that skips `getIdToken` will silently send unauthenticated requests.

**How to apply:** Flag any new fetch call in a hook that does not conditionally include `Authorization: Bearer ${token}`.

---

## Known Trust Boundary Issues

- `resolveAssetUrl` (App.tsx line 21-23) prepends API_BASE to any URL starting with `/`, but does NOT block `javascript:`, `data:`, or absolute URLs pointing to foreign origins. URLs come from Firestore session data (untrusted). Flag if image/music src values from sessions are ever rendered without this check.
- `sessionId` values from Firestore are interpolated directly into fetch URLs (`/api/v1/sessions/${sessionId}`) without encoding or validation. If a session_id ever contains `/` or `..` this becomes a path traversal risk — severity depends on backend routing.
- `storyTitle` from the SSE stream (set by `setStoryTitle(event.title as string)`) is passed to `BookMesh` → `createCoverTexture` and rendered via Canvas2D `fillText`. Canvas2D is immune to XSS but has no length cap.
- `proposal.title` and `proposal.brief` from the AI companion stream are rendered as React text nodes (no dangerouslySetInnerHTML found). Safe from XSS.
- No `dangerouslySetInnerHTML` found anywhere in the codebase as of 2026-03-24.

---

## Prompt Injection Surface

`handleStartJourney` in App.tsx line 92 constructs a story prompt as:
`${proposal.title}: ${proposal.brief}`
Both `title` and `brief` are extracted from the AI-generated SSE stream by `extractProposal()` in useCompanionChat.ts. A compromised or jailbroken backend response could inject arbitrary text into the story prompt sent to the main story generation endpoint.

---

## No Input Length Caps

Neither `CompanionChat` textarea nor `StoryPrompt` textarea have `maxLength` attributes or hook-level length guards. Unbounded user input flows to the backend.
