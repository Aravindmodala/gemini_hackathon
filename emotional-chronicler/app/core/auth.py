"""Google OAuth2 authentication for Vertex AI."""

import google.auth
import google.auth.transport.requests


def get_access_token() -> str:
    """
    Get a fresh OAuth2 access token using Application Default
    Credentials.  Scoped to cloud-platform for Vertex AI.
    """
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    auth_request = google.auth.transport.requests.Request()
    credentials.refresh(auth_request)
    return credentials.token
