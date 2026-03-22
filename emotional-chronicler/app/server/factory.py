"""
Application factory — assembles the FastAPI application.

Validates config, sets up middleware, mounts static files,
and includes route handlers.
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import PROJECT_ID, LOCATION, STORY_MODEL, IMAGEN_MODEL, PORT, FRONTEND_DIR, FIREBASE_ENABLED
from app.core.firebase import is_firebase_ready
from app.server.errors import http_exception_handler, validation_exception_handler
from app.server.middleware import setup_middleware
from app.server.routes import router, api_router
from app.server.session_routes import router as session_router

logger = logging.getLogger("chronicler")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    # ── Validate config ──────────────────────────────────────
    if not PROJECT_ID:
        logger.error("ERROR: Set GOOGLE_CLOUD_PROJECT environment variable.")
        sys.exit(1)

    # ── Lifespan ─────────────────────────────────────────────
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Initialize Firebase Auth (lazy init triggers here)
        firebase_status = "disabled"
        if FIREBASE_ENABLED:
            firebase_status = "✅ ready" if is_firebase_ready() else "⚠️ unavailable"

        logger.info("")
        logger.info("📖  The Emotional Chronicler — Creative Storyteller")
        logger.info(f"   Project:  {PROJECT_ID}")
        logger.info(f"   Location: {LOCATION}")
        logger.info(f"   Agent:    {STORY_MODEL}  (ADK)")
        logger.info(f"   Images:   {IMAGEN_MODEL}  (Imagen 4)")
        logger.info(f"   Music:    lyria-002  (Lyria 2)")
        logger.info(f"   Firebase: {firebase_status}")
        logger.info(f"   Port:     {PORT}")
        logger.info("")
        yield
        logger.info("Shutting down...")

    # ── Assemble app ─────────────────────────────────────────
    app = FastAPI(title="The Emotional Chronicler", lifespan=lifespan)

    # Middleware
    setup_middleware(app)

    # Exception handlers — uniform error envelope
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    # Static files (frontend build)
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    # Routes — static assets and SPA catch-all (no version prefix)
    app.include_router(router)

    # Versioned API routes
    app.include_router(api_router, prefix="/api/v1")
    app.include_router(session_router, prefix="/api/v1")

    return app
