import logging
import os
import sys

from dotenv import load_dotenv

# Load environment variables before any app imports
load_dotenv()

# Configure logging
_LOG_LEVEL_NAME = os.getenv("LOG_LEVEL", "INFO").upper()
_LOG_LEVEL = getattr(logging, _LOG_LEVEL_NAME, logging.INFO)

logging.basicConfig(
    level=_LOG_LEVEL,
    format="%(asctime)s [%(levelname)-8s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)

# Keep third-party SDK log noise down unless explicitly overridden.
if os.getenv("LOG_LEVEL") is None:
    logging.getLogger("google_genai").setLevel(logging.WARNING)
    logging.getLogger("google_adk").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

# Create the FastAPI application
from app import create_app  # noqa: E402

app = create_app()
