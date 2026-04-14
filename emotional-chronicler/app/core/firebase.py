"""Firebase Admin SDK initialization and token verification.

Provides lazy singleton initialization of the Firebase Admin app
and helpers for verifying Firebase ID tokens (user authentication).
Follows the same graceful-degradation pattern as store.py.
"""

import logging

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from app.config import FIREBASE_ENABLED

logger = logging.getLogger("chronicler")

# ── Singleton state ──────────────────────────────────────────
_firebase_app: firebase_admin.App | None = None
_firebase_available: bool = True


def _get_firebase_app() -> firebase_admin.App | None:
    """Lazy-initialize the Firebase Admin SDK. Returns None if unavailable.

    Uses Application Default Credentials (ADC) which auto-detects
    GCP credentials in Cloud Run or from a local service account.
    """
    global _firebase_app, _firebase_available

    if not FIREBASE_ENABLED:
        return None

    if not _firebase_available:
        return None

    if _firebase_app is None:
        try:
            # Check if already initialized (e.g. by another module)
            _firebase_app = firebase_admin.get_app()
            logger.info("[Firebase] Using existing Firebase app")
        except ValueError:
            # Not yet initialized — create with ADC
            try:
                _firebase_app = firebase_admin.initialize_app()
                logger.info("[Firebase] Admin SDK initialized (ADC)")
            except Exception as e:
                logger.warning("[Firebase] Initialization failed: %s", e)
                _firebase_available = False
                return None

    return _firebase_app


def is_firebase_ready() -> bool:
    """Check whether Firebase Admin SDK is initialized and available."""
    return _get_firebase_app() is not None


def verify_id_token(token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims.

    Args:
        token: The Firebase ID token string from the client.

    Returns:
        Decoded token dict containing ``uid``, ``email``, ``name``, etc.

    Raises:
        ValueError: If Firebase is not available, or the token is
            invalid / expired / revoked.
    """
    app = _get_firebase_app()
    if app is None:
        raise ValueError("Firebase Admin SDK is not available")

    try:
        # Allow tiny clock skew between client and server to avoid
        # transient "Token used too early" failures on otherwise valid tokens.
        decoded = firebase_auth.verify_id_token(token, app=app, clock_skew_seconds=10)
        logger.debug("[Firebase] Token verified for uid=%s", decoded.get("uid"))
        return decoded
    except firebase_auth.InvalidIdTokenError as e:
        raise ValueError(f"Invalid Firebase ID token: {e}") from e
    except firebase_auth.ExpiredIdTokenError as e:
        raise ValueError(f"Expired Firebase ID token: {e}") from e
    except firebase_auth.RevokedIdTokenError as e:
        raise ValueError(f"Revoked Firebase ID token: {e}") from e
    except Exception as e:
        raise ValueError(f"Token verification failed: {e}") from e


def get_user_info(uid: str) -> dict:
    """Fetch basic user info from Firebase Auth by UID.

    Args:
        uid: The Firebase user UID.

    Returns:
        Dict with ``uid``, ``email``, ``display_name``, and ``photo_url``.

    Raises:
        ValueError: If Firebase is not available or the user is not found.
    """
    app = _get_firebase_app()
    if app is None:
        raise ValueError("Firebase Admin SDK is not available")

    try:
        user = firebase_auth.get_user(uid, app=app)
        return {
            "uid": user.uid,
            "email": user.email,
            "display_name": user.display_name,
            "photo_url": user.photo_url,
        }
    except firebase_auth.UserNotFoundError as e:
        raise ValueError(f"User not found: {uid}") from e
    except Exception as e:
        raise ValueError(f"Failed to fetch user info: {e}") from e
