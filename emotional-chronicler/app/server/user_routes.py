"""
User profile and onboarding routes.

Routes (mounted at /api/v1/users by factory.py):
  GET  /me                    — fetch profile (creates stub on first call)
  PUT  /me                    — upsert display_name, photo_url, preferences
  POST /me/onboarding/complete — mark wizard done + save final preferences
  POST /me/onboarding/skip    — mark wizard done with empty preferences
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.user_store import UserPreferencesStore
from app.domain.user import (
    OnboardingCompleteRequest,
    UpsertUserRequest,
    UserPreferences,
    UserProfileResponse,
)
from app.server.auth_middleware import get_current_user

logger = logging.getLogger("chronicler")

user_router = APIRouter(tags=["users"])
_store = UserPreferencesStore()


# ── GET /me ──────────────────────────────────────────────────────────────────

@user_router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Fetch the authenticated user's profile",
)
async def get_me(current_user: dict = Depends(get_current_user)) -> UserProfileResponse:
    """Return the user's profile. Creates a stub document on first call."""
    uid: str = current_user["uid"]
    profile = await asyncio.to_thread(
        _store.get_or_create,
        uid,
        display_name=current_user.get("name"),
        email=current_user.get("email"),
        photo_url=current_user.get("picture"),
    )
    return UserProfileResponse(
        uid=profile.uid,
        display_name=profile.display_name,
        email=profile.email,
        photo_url=profile.photo_url,
        onboarded_at=profile.onboarded_at,
        preferences=profile.preferences,
    )


# ── PUT /me ───────────────────────────────────────────────────────────────────

@user_router.put(
    "/me",
    response_model=UserProfileResponse,
    summary="Upsert the authenticated user's profile and preferences",
)
async def put_me(
    body: UpsertUserRequest,
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    """Full upsert of profile fields and preferences."""
    uid: str = current_user["uid"]

    await asyncio.to_thread(
        _store.upsert,
        uid,
        display_name=body.display_name,
        photo_url=body.photo_url,
        preferences=body.preferences,
    )

    profile = await asyncio.to_thread(_store.get_or_create, uid)
    if not profile:
        raise HTTPException(status_code=500, detail="Failed to fetch updated profile")

    return UserProfileResponse(
        uid=profile.uid,
        display_name=profile.display_name,
        email=profile.email,
        photo_url=profile.photo_url,
        onboarded_at=profile.onboarded_at,
        preferences=profile.preferences,
    )


# ── POST /me/onboarding/complete ──────────────────────────────────────────────

@user_router.post(
    "/me/onboarding/complete",
    response_model=UserProfileResponse,
    summary="Mark onboarding complete and save preferences",
)
async def onboarding_complete(
    body: OnboardingCompleteRequest,
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    """Set onboarded_at = now and persist the final wizard preferences."""
    uid: str = current_user["uid"]

    await asyncio.to_thread(_store.mark_onboarded, uid, preferences=body.preferences)
    profile = await asyncio.to_thread(_store.get_or_create, uid)

    return UserProfileResponse(
        uid=profile.uid,
        display_name=profile.display_name,
        email=profile.email,
        photo_url=profile.photo_url,
        onboarded_at=profile.onboarded_at,
        preferences=profile.preferences,
    )


# ── POST /me/onboarding/skip ──────────────────────────────────────────────────

@user_router.post(
    "/me/onboarding/skip",
    response_model=UserProfileResponse,
    summary="Skip onboarding (sets onboarded_at, leaves preferences empty)",
)
async def onboarding_skip(
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    """
    Record that the user skipped onboarding.

    Sets onboarded_at=now so the wizard gate does not re-fire.
    Preferences remain empty so the OnboardingNudge banner can appear.
    """
    uid: str = current_user["uid"]

    await asyncio.to_thread(_store.mark_skipped, uid)
    profile = await asyncio.to_thread(_store.get_or_create, uid)

    return UserProfileResponse(
        uid=profile.uid,
        display_name=profile.display_name,
        email=profile.email,
        photo_url=profile.photo_url,
        onboarded_at=profile.onboarded_at,
        preferences=profile.preferences,
    )
