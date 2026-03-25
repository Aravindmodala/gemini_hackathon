---
name: Frontend Code Patterns & Known Issues
description: Recurring patterns, DRY violations, and anti-patterns observed in the React frontend of Emotional Chronicler
type: project
---

Key conventions and known issues in the frontend codebase (as of 2026-03-24):

**API_BASE duplication:** `import.meta.env.VITE_API_URL || 'http://localhost:3001'` is duplicated in App.tsx, useStoryteller.ts, useCompanionChat.ts, and useSessions.ts. Should be extracted to a shared config module.

**Why:** Each hook/component defining its own API_BASE means a URL change requires touching 4+ files and risks drift.

**How to apply:** When reviewing or touching any file that defines API_BASE locally, flag it and suggest extracting to `src/config/api.ts` or similar.

---

**SIDEBAR_WIDTH duplication:** The constant `300` (sidebar width in px) is defined independently in both App.tsx (line 190) and SessionSidebar.tsx (line 327). Margin calculation in App.tsx depends on this matching SessionSidebar's actual width — a silent contract.

**Why:** If SessionSidebar's width changes, App.tsx's `marginLeft` will silently mis-align.

**How to apply:** Flag this whenever either file is touched. Fix is to either export the constant from SessionSidebar or define it in a shared layout constants file.

---

**keyframe animation triplicate:** `@keyframes pulse-orb` and `@keyframes blink` are each defined in three places: App.css, AvatarHUD.tsx (inline `<style>`), and App.tsx (inline `<style>`). This causes redundant DOM injections and maintenance divergence.

**How to apply:** Suggest consolidating all keyframes into App.css and removing the inline `<style>` blocks from App.tsx and AvatarHUD.tsx.

---

**VoiceButton dead duplicate in Book3D/index.tsx:** A local `VoiceButton` function is defined in Book3D/index.tsx that renders a stub (no onClick, no state) while a full, functional `VoiceButton` component already exists at `components/VoiceButton.tsx`. The local stub is essentially a non-functional placeholder that ignores the existing implementation.

**How to apply:** When reviewing Book3D/index.tsx, flag the local VoiceButton as a dead stub and recommend replacing it with the existing VoiceButton component (once narration is wired up).

---

**handleBeginStory not memoized:** In App.tsx, `handleBeginStory` at line 114 is defined as a plain function (not `useCallback`), unlike every other handler in the same file. This is inconsistent and causes StoryPrompt to re-render on every App render cycle since the prop reference changes.

**How to apply:** Add `useCallback` to `handleBeginStory` with dependencies `[startStory, fetchSessions]`.

---

**Session hydration type safety:** In App.tsx `handleSelectSession`, `interaction.args` is cast repeatedly via `(args as Record<string, unknown>).someField` with nested ternaries across ~20 lines. The `Interaction` type in types/session.ts already types `args` as `Record<string, any>`, so the double-casting is redundant noise. The real issue is that the tool response schema (what fields an image vs music tool returns) is not typed — it's sniffed at runtime with multiple fallbacks.

**How to apply:** Suggest creating typed tool result interfaces (ImageToolResult, MusicToolResult) in types/session.ts and a discriminated union or parse function to normalize them, reducing the hydration logic to a clean switch.

---

**clearTimer not stable in useBookState:** `clearTimer` at line 14 of useBookState.ts is defined as a plain function inside the hook body (not useCallback), so it gets recreated every render. All four `useCallback` hooks in the file close over it — but since it only uses the ref (not state), this is harmless in practice but technically impure. Low priority.

---

**setTimeout without clearTimeout in Book3D handleClose:** The `handleClose` callback in Book3D/index.tsx calls `setTimeout(onClose, 1300)` but never stores the timer ID, so it cannot be cancelled if the component unmounts before the timeout fires, potentially calling `onClose` on an unmounted tree.

**How to apply:** Store the timeout ID in a ref and clear it in a useEffect cleanup.
