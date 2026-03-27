---
name: Frontend Code Patterns & Known Issues
description: Recurring patterns, DRY violations, and anti-patterns observed in the React frontend of Emotional Chronicler
type: project
---

Key conventions and known issues in the frontend codebase. Issues marked RESOLVED were fixed in the 2026-03-26 refactor.

---

**RESOLVED — API_BASE extraction:** `src/config/api.ts` now exports `API_BASE`. useStoryteller.ts and App.tsx both import from it. HOWEVER: `useCompanionChat.ts` (line 37) and `useSessions.ts` (line 5) still define `API_BASE` locally as a raw string. Two of the four original duplicates remain.

**How to apply:** When touching useSessions.ts or useCompanionChat.ts, update them to import from `src/config/api.ts`.

---

**RESOLVED — SIDEBAR_WIDTH extraction:** `src/config/layout.ts` now exports `SIDEBAR_WIDTH = 300`. App.tsx imports it. HOWEVER: `SessionSidebar.tsx` (line 327) still defines its own local `const SIDEBAR_WIDTH = 300`. The silent contract between the two files still exists.

**How to apply:** When touching SessionSidebar.tsx, replace local SIDEBAR_WIDTH with import from `src/config/layout.ts`.

---

**RESOLVED — resolveAssetUrl extraction:** `src/utils/resolveAssetUrl.ts` is now the single definition. App.tsx and useStoryteller.ts both import it correctly. No duplication remains in the reviewed files.

---

**RESOLVED — handleBeginStory memoized:** `handleBeginStory` in App.tsx is now wrapped in `useCallback` with deps `[startStory, fetchSessions]`. Confirmed fixed.

---

**RESOLVED — stale closure in useStoryteller:** The post-stream `setStatus` now uses the functional updater form: `setStatus(prev => prev === 'generating' ? 'done' : prev)`. Confirmed fixed at line 169.

---

**RESOLVED — StoryView sidebarOffset prop:** StoryView now accepts `sidebarOffset?: number` and applies `left: sidebarOffset ?? 0` to its container style. App.tsx passes `sidebarOffset={isSidebarOpen ? SIDEBAR_WIDTH : 0}`. Confirmed fixed.

---

**RESOLVED — StoryView Google Fonts inline style:** The `@import` for Playfair Display is removed from StoryView's inline `<style>`. It is now served via `<link>` in `index.html`. Confirmed fixed.

---

**RESOLVED — EmptyState no-op hooks and empty interface:** The no-op `useEffect`, `useRef`, and empty `EmptyStateProps` interface have been removed. EmptyState.tsx is now a clean, props-free functional component.

---

**RESOLVED — types/session.ts improvements:** `args` type changed from `Record<string, any>` to `Record<string, unknown>`. `ImageToolResult` and `MusicToolResult` interfaces added. The double-casting in App.tsx `handleSelectSession` is now backed by these types.

---

**RESOLVED — console.log removed from App.tsx:** No `console.log` calls remain. Only `console.warn` and `console.error` are present. Confirmed.

---

**PARTIAL — Inline keyframe in App.tsx:** The large inline `<style>` block with duplicate keyframes was removed from App.tsx. HOWEVER: App.tsx still contains a `<style>` tag inside `LoadingScreen` at line 26 for `@keyframes authSpinner`. This keyframe is unique (not in App.css) so it is a legitimate inline style, not a duplicate. Not a bug.

---

**REMAINING — keyframe animation triplicate in AvatarHUD.tsx:** `@keyframes pulse-orb` and `@keyframes blink` may still be defined inside an inline `<style>` in AvatarHUD.tsx. Verify against App.css — this file was NOT in scope for the 2026-03-26 fix batch.

---

**REMAINING — API_BASE still local in useCompanionChat.ts and useSessions.ts:** Both files define `const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'` locally instead of importing from `src/config/api.ts`.

---

**REMAINING — SIDEBAR_WIDTH still local in SessionSidebar.tsx:** Line 327 still has `const SIDEBAR_WIDTH = 300;` — should import from `src/config/layout.ts`.

---

**REMAINING — VoiceButton dead duplicate in Book3D/index.tsx:** A local `VoiceButton` function is defined in Book3D/index.tsx that renders a stub (no onClick, no state) while a full, functional `VoiceButton` component already exists at `components/VoiceButton.tsx`.

---

**REMAINING — setTimeout without clearTimeout in Book3D handleClose:** The `handleClose` callback calls `setTimeout(onClose, 1300)` but never stores the timer ID, so it cannot be cancelled if the component unmounts before the timeout fires.

---

**REMAINING — handleSignOut not memoized in App.tsx:** Still defined as a plain arrow function at line 176, not useCallback. Low impact but inconsistent with the rest of the file.

---

**REMAINING — index.html Google Fonts link is incomplete:** `index.html` now loads `Playfair Display` and `Cinzel` via `<link>` (correct). However, `App.css` line 7 still has a duplicate `@import url(...)` for `Cinzel` and `Inter` from Google Fonts. Both the HTML `<link>` and the CSS `@import` will fire, resulting in two separate HTTP requests for font data on page load. The CSS `@import` in App.css should be removed in favor of the HTML link, OR the HTML link should be extended to also include Inter (currently missing from the `<link>` tag).
