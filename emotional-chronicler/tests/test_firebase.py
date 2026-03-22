"""Unit tests for app/core/firebase.py — Firebase Admin SDK helpers."""

import pytest
from unittest.mock import MagicMock, patch


class TestVerifyIdToken:
    """Tests for verify_id_token()."""

    def test_verify_id_token_with_valid_token_returns_decoded_dict(self):
        """Valid token → returns decoded claims dict."""
        mock_decoded = {"uid": "user-abc", "email": "a@b.com", "name": "Alice"}

        with patch("app.core.firebase._get_firebase_app") as mock_get_app, \
             patch("app.core.firebase.firebase_auth") as mock_auth:
            mock_get_app.return_value = MagicMock()
            mock_auth.verify_id_token.return_value = mock_decoded

            from app.core.firebase import verify_id_token
            result = verify_id_token("valid-token-123")

            assert result == mock_decoded
            mock_auth.verify_id_token.assert_called_once_with(
                "valid-token-123", app=mock_get_app.return_value
            )

    def test_verify_id_token_with_invalid_token_raises_value_error(self):
        """Invalid token → raises ValueError."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app, \
             patch("app.core.firebase.firebase_auth") as mock_auth:
            mock_get_app.return_value = MagicMock()
            mock_auth.InvalidIdTokenError = type("InvalidIdTokenError", (Exception,), {})
            mock_auth.verify_id_token.side_effect = mock_auth.InvalidIdTokenError("bad token")

            from app.core.firebase import verify_id_token
            with pytest.raises(ValueError, match="Invalid Firebase ID token"):
                verify_id_token("bad-token")

    def test_verify_id_token_with_expired_token_raises_value_error(self):
        """Expired token → raises ValueError."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app, \
             patch("app.core.firebase.firebase_auth") as mock_auth:
            mock_get_app.return_value = MagicMock()
            mock_auth.ExpiredIdTokenError = type("ExpiredIdTokenError", (Exception,), {})
            mock_auth.InvalidIdTokenError = type("InvalidIdTokenError", (Exception,), {})
            mock_auth.RevokedIdTokenError = type("RevokedIdTokenError", (Exception,), {})
            mock_auth.verify_id_token.side_effect = mock_auth.ExpiredIdTokenError("expired")

            from app.core.firebase import verify_id_token
            with pytest.raises(ValueError, match="Expired Firebase ID token"):
                verify_id_token("expired-token")

    def test_verify_id_token_with_revoked_token_raises_value_error(self):
        """Revoked token → raises ValueError."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app, \
             patch("app.core.firebase.firebase_auth") as mock_auth:
            mock_get_app.return_value = MagicMock()
            mock_auth.InvalidIdTokenError = type("InvalidIdTokenError", (Exception,), {})
            mock_auth.ExpiredIdTokenError = type("ExpiredIdTokenError", (Exception,), {})
            mock_auth.RevokedIdTokenError = type("RevokedIdTokenError", (Exception,), {})
            mock_auth.verify_id_token.side_effect = mock_auth.RevokedIdTokenError("revoked")

            from app.core.firebase import verify_id_token
            with pytest.raises(ValueError, match="Revoked Firebase ID token"):
                verify_id_token("revoked-token")

    def test_verify_id_token_when_firebase_not_available_raises_value_error(self):
        """Firebase unavailable → raises ValueError."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app:
            mock_get_app.return_value = None

            from app.core.firebase import verify_id_token
            with pytest.raises(ValueError, match="Firebase Admin SDK is not available"):
                verify_id_token("any-token")


class TestGetUserInfo:
    """Tests for get_user_info()."""

    def test_get_user_info_with_valid_uid_returns_user_dict(self):
        """Valid UID → returns user info dict."""
        mock_user = MagicMock()
        mock_user.uid = "user-abc"
        mock_user.email = "a@b.com"
        mock_user.display_name = "Alice"
        mock_user.photo_url = "https://example.com/photo.jpg"

        with patch("app.core.firebase._get_firebase_app") as mock_get_app, \
             patch("app.core.firebase.firebase_auth") as mock_auth:
            mock_get_app.return_value = MagicMock()
            mock_auth.get_user.return_value = mock_user

            from app.core.firebase import get_user_info
            result = get_user_info("user-abc")

            assert result == {
                "uid": "user-abc",
                "email": "a@b.com",
                "display_name": "Alice",
                "photo_url": "https://example.com/photo.jpg",
            }

    def test_get_user_info_when_firebase_not_available_raises_value_error(self):
        """Firebase unavailable → raises ValueError."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app:
            mock_get_app.return_value = None

            from app.core.firebase import get_user_info
            with pytest.raises(ValueError, match="Firebase Admin SDK is not available"):
                get_user_info("any-uid")

    def test_get_user_info_user_not_found_raises_value_error(self):
        """User not found → raises ValueError."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app, \
             patch("app.core.firebase.firebase_auth") as mock_auth:
            mock_get_app.return_value = MagicMock()
            mock_auth.UserNotFoundError = type("UserNotFoundError", (Exception,), {})
            mock_auth.get_user.side_effect = mock_auth.UserNotFoundError("not found")

            from app.core.firebase import get_user_info
            with pytest.raises(ValueError, match="User not found"):
                get_user_info("nonexistent-uid")


class TestIsFirebaseReady:
    """Tests for is_firebase_ready()."""

    def test_is_firebase_ready_returns_true_when_app_available(self):
        """Firebase app available → returns True."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app:
            mock_get_app.return_value = MagicMock()

            from app.core.firebase import is_firebase_ready
            assert is_firebase_ready() is True

    def test_is_firebase_ready_returns_false_when_app_unavailable(self):
        """Firebase app unavailable → returns False."""
        with patch("app.core.firebase._get_firebase_app") as mock_get_app:
            mock_get_app.return_value = None

            from app.core.firebase import is_firebase_ready
            assert is_firebase_ready() is False


class TestLazyInitialization:
    """Tests for the lazy initialization pattern in _get_firebase_app()."""

    def test_get_firebase_app_returns_none_when_firebase_disabled(self):
        """FIREBASE_ENABLED=False → returns None."""
        with patch("app.core.firebase.FIREBASE_ENABLED", False), \
             patch("app.core.firebase._firebase_app", None), \
             patch("app.core.firebase._firebase_available", True):
            from app.core.firebase import _get_firebase_app
            assert _get_firebase_app() is None

    def test_get_firebase_app_returns_none_when_not_available(self):
        """_firebase_available=False → returns None."""
        with patch("app.core.firebase.FIREBASE_ENABLED", True), \
             patch("app.core.firebase._firebase_available", False):
            from app.core.firebase import _get_firebase_app
            assert _get_firebase_app() is None

    def test_get_firebase_app_returns_existing_app(self):
        """Already initialized → returns cached app."""
        mock_app = MagicMock()
        with patch("app.core.firebase.FIREBASE_ENABLED", True), \
             patch("app.core.firebase._firebase_available", True), \
             patch("app.core.firebase._firebase_app", mock_app):
            from app.core.firebase import _get_firebase_app
            assert _get_firebase_app() is mock_app
