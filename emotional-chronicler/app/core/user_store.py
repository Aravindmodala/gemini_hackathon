"""Firestore persistence for user profiles and preferences."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from google.cloud import firestore

from app.config import PROJECT_ID
from app.domain.user import UserPreferences, UserProfile

logger = logging.getLogger("chronicler")

_db = None
_db_available = True


def _get_db() -> firestore.Client | None:
    global _db, _db_available
    if not _db_available:
        return None
    if _db is None:
        try:
            _db = firestore.Client(project=PROJECT_ID)
            logger.info("[UserStore] Firestore client initialized")
        except Exception as e:
            logger.warning("[UserStore] Firestore unavailable: %s", e)
            _db_available = False
            return None
    return _db


def _user_doc_ref(db: firestore.Client, uid: str):
    return db.collection("users").document(uid)


class UserPreferencesStore:
    """
    Manages user profile and preferences in Firestore users/{uid}.

    Usage:
        store = UserPreferencesStore()
        profile = store.get(uid)
        store.upsert(uid, display_name="Jane", email="j@e.com", preferences=prefs)
        store.mark_onboarded(uid, preferences=prefs)
    """

    def get(self, uid: str) -> UserProfile | None:
        """Fetch the user document. Returns None if not found or Firestore unavailable."""
        db = _get_db()
        if not db:
            return None
        try:
            doc = _user_doc_ref(db, uid).get()
            if not doc.exists:
                return None
            return self._doc_to_profile(uid, doc.to_dict())
        except Exception as e:
            logger.warning("[UserStore] Failed to get user %s: %s", uid, e)
            return None

    def get_or_create(
        self,
        uid: str,
        *,
        display_name: str | None = None,
        email: str | None = None,
        photo_url: str | None = None,
    ) -> UserProfile:
        """
        Fetch the user document, creating a stub if it doesn't exist.

        Used by GET /me to bootstrap the profile from Firebase claims on first call.
        The created stub has onboarded_at=None so the frontend wizard gate fires.
        """
        existing = self.get(uid)
        if existing:
            return existing

        db = _get_db()
        now = datetime.now(timezone.utc)
        stub: dict = {
            "display_name": display_name,
            "email": email,
            "photo_url": photo_url,
            "created_at": now,
            "onboarded_at": None,
            "updated_at": now,
            "preferences": {
                "favorite_genres": [],
                "favorite_authors": [],
                "favorite_books": [],
                "tones": [],
                "themes": [],
                "atmospheres": [],
            },
        }

        if db:
            try:
                _user_doc_ref(db, uid).set(stub)
                logger.info("[UserStore] Stub created for uid=%s", uid)
            except Exception as e:
                logger.warning("[UserStore] Failed to create stub for %s: %s", uid, e)

        return UserProfile(
            uid=uid,
            display_name=display_name,
            email=email,
            photo_url=photo_url,
            created_at=now,
            onboarded_at=None,
            updated_at=now,
            preferences=UserPreferences(),
        )

    def upsert(
        self,
        uid: str,
        *,
        display_name: str | None = None,
        photo_url: str | None = None,
        preferences: UserPreferences,
    ) -> None:
        """Full upsert of profile fields + preferences."""
        db = _get_db()
        if not db:
            return
        now = datetime.now(timezone.utc)
        update: dict = {
            "updated_at": now,
            "preferences": preferences.model_dump(),
        }
        if display_name is not None:
            update["display_name"] = display_name
        if photo_url is not None:
            update["photo_url"] = photo_url

        try:
            _user_doc_ref(db, uid).set(update, merge=True)
            logger.info("[UserStore] Upserted uid=%s", uid)
        except Exception as e:
            logger.warning("[UserStore] Failed to upsert uid=%s: %s", uid, e)

    def mark_onboarded(self, uid: str, *, preferences: UserPreferences) -> None:
        """Set onboarded_at = now and save final preferences."""
        db = _get_db()
        if not db:
            return
        now = datetime.now(timezone.utc)
        try:
            _user_doc_ref(db, uid).set(
                {
                    "onboarded_at": now,
                    "updated_at": now,
                    "preferences": preferences.model_dump(),
                },
                merge=True,
            )
            logger.info("[UserStore] Marked onboarded uid=%s", uid)
        except Exception as e:
            logger.warning("[UserStore] Failed to mark onboarded uid=%s: %s", uid, e)

    def mark_skipped(self, uid: str) -> None:
        """
        Record that the user skipped onboarding.

        Sets onboarded_at = now but leaves preferences empty.
        The frontend shows the OnboardingNudge banner when prefs are empty.
        """
        db = _get_db()
        if not db:
            return
        now = datetime.now(timezone.utc)
        try:
            _user_doc_ref(db, uid).set(
                {"onboarded_at": now, "updated_at": now},
                merge=True,
            )
            logger.info("[UserStore] Marked skipped uid=%s", uid)
        except Exception as e:
            logger.warning("[UserStore] Failed to mark skipped uid=%s: %s", uid, e)

    # ── Helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _doc_to_profile(uid: str, data: dict) -> UserProfile:
        prefs_raw = data.get("preferences", {})
        prefs = UserPreferences(
            favorite_genres=prefs_raw.get("favorite_genres", []),
            favorite_authors=prefs_raw.get("favorite_authors", []),
            favorite_books=prefs_raw.get("favorite_books", []),
            tones=prefs_raw.get("tones", []),
            themes=prefs_raw.get("themes", []),
            atmospheres=prefs_raw.get("atmospheres", []),
        )
        return UserProfile(
            uid=uid,
            display_name=data.get("display_name"),
            email=data.get("email"),
            photo_url=data.get("photo_url"),
            created_at=data.get("created_at"),
            onboarded_at=data.get("onboarded_at"),
            updated_at=data.get("updated_at"),
            preferences=prefs,
        )
