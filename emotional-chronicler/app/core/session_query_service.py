"""Read-model service for session REST API queries.

Handles list/get/delete/update operations on session documents in Firestore.
These are stateless operations that don't require a SessionStore instance.
"""

import logging
from datetime import datetime, timezone

from google.cloud import firestore

from app.config import GCS_BUCKET
from app.core.store import _get_db, _safe_iso, _session_doc_ref, _get_preview

logger = logging.getLogger("chronicler")

# Old GCS public URL prefix used before the signed-URL migration.
_OLD_GCS_PREFIX = f"https://storage.googleapis.com/{GCS_BUCKET}/"
_IMAGE_TOOL_NAMES = ("generated_image", "inline_image", "generate_image")


def _get_thumbnail(interactions: list[dict]) -> str | None:
    """Return the URL of the first inline image in a session's interactions."""
    for interaction in interactions:
        if interaction.get("role") != "tool":
            continue
        if interaction.get("name") not in _IMAGE_TOOL_NAMES:
            continue
        args = interaction.get("args", {})
        url = args.get("image_url") or args.get("url")
        if url:
            return url
    return None


def _extract_user_id_from_doc_ref(doc_ref) -> str | None:
    """Extract owner user_id from sessions/{user_id}/conversations/{session_id} path."""
    try:
        parent = getattr(doc_ref, "parent", None)
        owner_ref = getattr(parent, "parent", None) if parent else None
        owner_id = getattr(owner_ref, "id", None)
        if owner_id:
            return owner_id
    except Exception:
        pass

    path = getattr(doc_ref, "path", "")
    parts = path.split("/")
    if len(parts) >= 2 and parts[0] == "sessions":
        return parts[1]
    return None


def _parse_image_args(interaction: dict) -> dict:
    args = interaction.get("args", {})
    return args if isinstance(args, dict) else {}


def _extract_image_prompt(interaction: dict) -> str | None:
    args = _parse_image_args(interaction)
    prompt = args.get("image_prompt") or args.get("prompt")
    if isinstance(prompt, str):
        prompt = prompt.strip()
        if prompt:
            return prompt
    return None


def _interaction_matches_asset(
    interaction: dict,
    *,
    session_id: str,
    filename: str,
    blob_path: str,
) -> bool:
    """Return True when a tool interaction points to the target asset."""
    if interaction.get("role") != "tool":
        return False
    if interaction.get("name") not in _IMAGE_TOOL_NAMES:
        return False

    args = _parse_image_args(interaction)

    interaction_blob_path = args.get("blob_path")
    if isinstance(interaction_blob_path, str):
        if interaction_blob_path == blob_path:
            return True
        if interaction_blob_path.endswith(f"/{filename}") and f"/{session_id}/" in interaction_blob_path:
            return True

    for key in ("image_url", "url"):
        url = args.get(key)
        if not isinstance(url, str) or not url:
            continue
        if url.endswith(f"/assets/images/{session_id}/{filename}"):
            return True
        if url.endswith(f"/api/images/{filename}"):
            return True
        if url.startswith(_OLD_GCS_PREFIX) and url.endswith(f"/images/{session_id}/{filename}"):
            return True

    return False


def _rewrite_legacy_image_urls(
    interactions: list[dict],
    *,
    session_id: str | None = None,
) -> list[dict]:
    """Rewrite legacy image URLs to the new asset endpoint paths.

    Supported rewrites:
    - Old GCS public URL:
      https://storage.googleapis.com/{bucket}/images/{session_id}/{file}
      -> /api/v1/assets/images/{session_id}/{file}
    - Old local cache URL:
      /api/images/{file}
      -> /api/v1/assets/images/{session_id}/{file}
      (prefers args["blob_path"] when available)
    """
    for interaction in interactions:
        if interaction.get("role") != "tool":
            continue
        if interaction.get("name") not in _IMAGE_TOOL_NAMES:
            continue
        args = interaction.get("args", {})
        url = args.get("image_url", "")
        if url.startswith(_OLD_GCS_PREFIX):
            blob_path = url[len(_OLD_GCS_PREFIX):]
            args["image_url"] = f"/api/v1/assets/{blob_path}"
            continue

        if url.startswith("/api/images/"):
            # Most reliable: use persisted blob_path when present.
            blob_path = args.get("blob_path")
            if isinstance(blob_path, str) and blob_path.startswith("images/"):
                args["image_url"] = f"/api/v1/assets/{blob_path}"
                continue

            # Fallback: derive from current session id + filename.
            if session_id:
                filename = url.rsplit("/", 1)[-1]
                if filename:
                    args["image_url"] = f"/api/v1/assets/images/{session_id}/{filename}"
    return interactions


class SessionQueryService:
    """Stateless service for session CRUD queries used by session_routes.py."""

    @staticmethod
    def list_sessions(
        user_id: str, limit: int = 20, cursor: str | None = None
    ) -> tuple[list[dict], str | None]:
        """List sessions for a user with cursor-based pagination.

        Args:
            user_id: The Firebase UID of the user.
            limit: Maximum number of sessions to return (1-100).
            cursor: Opaque cursor - the session_id of the last item from the previous page.

        Returns:
            A (sessions, next_cursor) tuple. next_cursor is None when no more pages exist.
        """
        db = _get_db()
        if not db:
            return [], None
        try:
            conversations_ref = (
                db.collection("sessions")
                .document(user_id)
                .collection("conversations")
            )
            query = conversations_ref.order_by(
                "updated_at", direction=firestore.Query.DESCENDING
            )

            if cursor:
                cursor_doc = conversations_ref.document(cursor).get()
                if cursor_doc.exists:
                    query = query.start_after(cursor_doc)

            docs = list(query.limit(limit + 1).stream())

            has_next = len(docs) > limit
            page_docs = docs[:limit]

            sessions = []
            for doc in page_docs:
                data = doc.to_dict()
                interactions = _rewrite_legacy_image_urls(
                    data.get("interactions", []),
                    session_id=doc.id,
                )
                sessions.append({
                    "session_id": doc.id,
                    "title": data.get("title", "Untitled Story"),
                    "status": data.get("status", "unknown"),
                    "created_at": _safe_iso(data.get("created_at")),
                    "updated_at": _safe_iso(data.get("updated_at")),
                    "interaction_count": len(interactions),
                    "preview": _get_preview(interactions),
                    "thumbnail_url": _get_thumbnail(interactions),
                })

            next_cursor = page_docs[-1].id if has_next and page_docs else None
            return sessions, next_cursor

        except Exception as e:
            logger.warning("[SessionQuery] Failed to list sessions: %s", e)
            return [], None

    @staticmethod
    def get_session(user_id: str, session_id: str) -> dict | None:
        """Get a single session with all interactions."""
        db = _get_db()
        if not db:
            return None
        try:
            doc_ref = _session_doc_ref(db, user_id, session_id)
            doc = doc_ref.get()
            if not doc.exists:
                return None
            data = doc.to_dict()
            interactions = _rewrite_legacy_image_urls(
                data.get("interactions", []),
                session_id=doc.id,
            )
            return {
                "session_id": doc.id,
                "title": data.get("title", "Untitled Story"),
                "status": data.get("status", "unknown"),
                "created_at": _safe_iso(data.get("created_at")),
                "updated_at": _safe_iso(data.get("updated_at")),
                "interactions": interactions,
            }
        except Exception as e:
            logger.warning("[SessionQuery] Failed to get session: %s", e)
            return None

    @staticmethod
    def delete_session(user_id: str, session_id: str) -> bool:
        """Delete a session document."""
        db = _get_db()
        if not db:
            return False
        try:
            doc_ref = _session_doc_ref(db, user_id, session_id)
            doc_ref.delete()
            logger.info("[SessionQuery] Session deleted: %s/%s", user_id, session_id)
            return True
        except Exception as e:
            logger.warning("[SessionQuery] Failed to delete session: %s", e)
            return False

    @staticmethod
    def update_session_title(user_id: str, session_id: str, title: str) -> bool:
        """Update a session's title."""
        db = _get_db()
        if not db:
            return False
        try:
            doc_ref = _session_doc_ref(db, user_id, session_id)
            doc_ref.update({"title": title, "updated_at": datetime.now(timezone.utc)})
            return True
        except Exception as e:
            logger.warning("[SessionQuery] Failed to update title: %s", e)
            return False

    @staticmethod
    def find_image_interaction_for_asset(
        session_id: str,
        filename: str,
        blob_path: str,
    ) -> dict | None:
        """Resolve owner + matching interaction for an asset request.

        Returns a dict with:
          user_id, session_id, interaction, interaction_index, image_prompt
        or None when no match exists.
        """
        db = _get_db()
        if not db:
            return None

        try:
            for doc in db.collection_group("conversations").stream():
                if doc.id != session_id:
                    continue
                data = doc.to_dict() or {}
                interactions = data.get("interactions", [])
                if not isinstance(interactions, list):
                    continue

                for idx, interaction in enumerate(interactions):
                    if not isinstance(interaction, dict):
                        continue
                    if not _interaction_matches_asset(
                        interaction,
                        session_id=session_id,
                        filename=filename,
                        blob_path=blob_path,
                    ):
                        continue

                    return {
                        "user_id": _extract_user_id_from_doc_ref(doc.reference),
                        "session_id": session_id,
                        "interaction": interaction,
                        "interaction_index": idx,
                        "image_prompt": _extract_image_prompt(interaction),
                    }

            return None
        except Exception as e:
            logger.warning(
                "[SessionQuery] Failed to resolve image interaction for %s/%s: %s",
                session_id,
                filename,
                e,
            )
            return None

    @staticmethod
    def mark_image_interaction_regenerated(
        *,
        user_id: str,
        session_id: str,
        filename: str,
        blob_path: str,
        image_prompt: str,
        mime_type: str | None = None,
    ) -> bool:
        """Transactionally annotate a matched image interaction as regenerated."""
        db = _get_db()
        if not db:
            return False

        doc_ref = _session_doc_ref(db, user_id, session_id)
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        @firestore.transactional
        def _run(transaction):
            snapshot = doc_ref.get(transaction=transaction)
            if not snapshot.exists:
                return False

            data = snapshot.to_dict() or {}
            interactions = data.get("interactions", [])
            if not isinstance(interactions, list):
                return False

            updated = False
            for idx, interaction in enumerate(interactions):
                if not isinstance(interaction, dict):
                    continue
                if not _interaction_matches_asset(
                    interaction,
                    session_id=session_id,
                    filename=filename,
                    blob_path=blob_path,
                ):
                    continue

                entry = dict(interaction)
                args = _parse_image_args(entry).copy()
                args["blob_path"] = blob_path
                args["image_url"] = f"/api/v1/assets/images/{session_id}/{filename}"
                args["image_prompt"] = image_prompt[:500]
                args["regenerated"] = True
                args["regenerated_at"] = now_iso
                if mime_type:
                    args["mime_type"] = mime_type
                entry["args"] = args
                interactions[idx] = entry
                updated = True
                break

            if not updated:
                return False

            transaction.update(doc_ref, {
                "interactions": interactions,
                "updated_at": now,
            })
            return True

        try:
            return bool(_run(db.transaction()))
        except Exception as e:
            logger.warning(
                "[SessionQuery] Failed to mark regenerated image for %s/%s: %s",
                user_id,
                session_id,
                e,
            )
            return False
