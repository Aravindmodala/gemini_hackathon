"""
Application factory — assembles the FastAPI application.

Validates config, sets up middleware, mounts static files,
and includes route handlers.
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import PROJECT_ID, LOCATION, GEMINI_LIVE_MODEL, PORT, FRONTEND_DIR
from app.server.middleware import setup_middleware
from app.server.routes import router

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
        logger.info("")
        logger.info("🎙️  The Emotional Chronicler")
        logger.info(f"   Project:  {PROJECT_ID}")
        logger.info(f"   Location: {LOCATION}")
        logger.info(f"   Model:    {GEMINI_LIVE_MODEL}")
        logger.info(f"   Port:     {PORT}")
        logger.info("")
        yield
        logger.info("Shutting down...")

    # ── Assemble app ─────────────────────────────────────────
    app = FastAPI(title="The Emotional Chronicler", lifespan=lifespan)

    # Middleware
    setup_middleware(app)

    # Static files (frontend build)
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    # Routes
    app.include_router(router)

    return app
