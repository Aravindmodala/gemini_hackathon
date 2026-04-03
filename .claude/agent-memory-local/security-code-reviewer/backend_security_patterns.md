---
name: Security Patterns — Backend (store.py, chat_routes.py)
description: Thread safety posture of the Firestore client, known race conditions in chat_routes.py, and the lazy-init singleton pattern in store.py
type: project
---

## Firestore Client Thread Safety

`_get_db()` in `store.py` uses a module-level `_db` singleton initialized lazily with a double-check but WITHOUT a lock. Under concurrent `asyncio.to_thread()` calls during server startup this is a benign race (multiple `firestore.Client()` instances are created but the Python GIL makes the final assignment atomic — the extra clients are discarded). At runtime after initialization this is safe because `asyncio.to_thread` dispatches to the default `ThreadPoolExecutor` and `google-cloud-firestore` clients are documented as thread-safe.

**How to apply:** Do not flag the lazy-init pattern as a critical race condition — it is a mild startup-time concern, not a runtime hazard.

---

## Race Condition in companion_chat — store.log_interaction before ADK run

`chat_routes.py` logs the user message to Firestore (`store.log_interaction("user", ...)`) BEFORE the ADK `companion_runner.run_async()` call. If the ADK call raises immediately (auth failure, quota, etc.) the user message is already committed to Firestore with no corresponding Elora reply. This leaves orphaned partial interactions. Not a security issue — a reliability/data-integrity concern.

**How to apply:** Flag in warnings when reviewing chat_routes.py. Suggest moving user-message logging inside `event_stream()` alongside the Elora-reply log, or using a single batch write after the full turn.

---

## `_extract_proposal` — Prompt Injection via JSON in SSE

The companion's full response text is parsed by `_extract_proposal()` using a regex that looks for a ```story_proposal``` fenced block and then `json.loads()` the contents. The title/brief extracted here are saved to Firestore AND are used later (in the story route) to construct the story prompt injected into Elora's system prompt. A jailbroken or adversarially-manipulated model response can place arbitrary text in `title` or `brief`, which flows directly into the story generation prompt. This is consistent with the known prompt injection surface already recorded in `project_security_patterns.md`.

---

## COMPANION_MODEL default fixed to gemini-2.0-flash

As of 2026-03-26, `config.py` line 38 sets `COMPANION_MODEL` default to `"gemini-2.0-flash"`. Previous default was an invalid model name. This is a bug fix with no security implications.

---

## `asyncio.to_thread` wrapping pattern

All synchronous `SessionStore` methods in `chat_routes.py` are wrapped with `asyncio.to_thread()`. The Firestore Python client (grpc-based) is thread-safe. The `SessionStore` instance is created per-request (not shared), so instance-level state (`self._doc_ref`, `self.session_id`) is not shared across threads. Pattern is correct and safe.
