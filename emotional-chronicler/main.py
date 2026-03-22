import logging
import sys

from dotenv import load_dotenv

# Load environment variables before any app imports
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-8s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)

# Create the FastAPI application
from app import create_app  # noqa: E402

app = create_app()
