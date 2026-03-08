import asyncio
import json
import logging

import websockets
from fastapi import WebSocket, WebSocketDisconnect

from app.config import get_gemini_ws_url, get_model_resource_name
from app.core.auth import get_access_token
from app.core.relay import relay_gemini_to_client, relay_client_to_gemini
from app.core.store import SessionStore
from app.prompts import ELORA_SYSTEM_PROMPT
from app.tools import ToolRegistry

logger = logging.getLogger("chronicler")


class GeminiSession:
    """
    Manages a single Gemini Live API conversation.

    Each browser WebSocket connection creates one GeminiSession.
    The session handles authentication, Gemini connection, setup,
    bidirectional relay, Firestore logging, and cleanup.
    """

    def __init__(self, client_ws: WebSocket, registry: ToolRegistry, user_id: str):
        self.client_ws = client_ws
        self.registry = registry
        self.user_id = user_id
        self.store = SessionStore(user_id)
        self.gemini_ws = None

    async def start(self):
        """Run the full session lifecycle."""
        try:
            # 1. Create session in Firestore
            session_id = self.store.create_session()
            logger.info(f"[Session] Firestore session: {session_id}")

            # 2. Authenticate with Google Cloud
            token = get_access_token()

            # 3. Connect to Gemini Live API
            self.gemini_ws = await self._connect(token)
            logger.info("[Session] Connected to Gemini Live API")

            # 4. Send setup message (model, persona + memory, tools)
            await self._send_setup()
            logger.info("[Session] Setup message sent")

            # 5. Notify client we're ready
            await self.client_ws.send_json({"type": "status", "status": "connected"})

            # 6. Run bidirectional relay (with Firestore logging)
            await self._run_relay()

        except WebSocketDisconnect:
            logger.info("[Session] Browser disconnected")
        except Exception as e:
            logger.error(f"[Session] Error: {e}")
            try:
                await self.client_ws.send_json({"type": "error", "message": str(e)})
            except Exception:
                pass
        finally:
            await self._cleanup()

    async def _connect(self, token: str):
        """Open WebSocket connection to Gemini Live API."""
        gemini_url = get_gemini_ws_url()
        logger.info(f"[Session] Connecting to: {gemini_url}")

        return await websockets.connect(
            gemini_url,
            additional_headers={"Authorization": f"Bearer {token}"},
            max_size=16 * 1024 * 1024,  # 16 MB max message size
        )

    async def _send_setup(self):
        """Send BidiGenerateContentSetup message with tools, persona, and memory."""

        # Load previous session context from Firestore (if any)
        system_prompt = ELORA_SYSTEM_PROMPT
        previous_context = self.store.get_previous_context()
        if previous_context:
            system_prompt += previous_context
            logger.info("[Session] Injected previous session context into prompt")

        setup_msg = {
            "setup": {
                "model": get_model_resource_name(),
                "systemInstruction": {
                    "parts": [{"text": system_prompt}]
                },
                "tools": self.registry.get_declarations(),
                "generationConfig": {
                    "responseModalities": ["AUDIO", "TEXT"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": "Aoede",
                            }
                        }
                    },
                },
            }
        }
        await self.gemini_ws.send(json.dumps(setup_msg))

    async def _run_relay(self):
        """Run bidirectional audio/message relay with tool dispatch and logging."""
        await asyncio.gather(
            relay_gemini_to_client(
                self.gemini_ws, self.client_ws, self.registry, self.store
            ),
            relay_client_to_gemini(self.client_ws, self.gemini_ws),
        )

    async def _cleanup(self):
        """Close Gemini WebSocket and finalize Firestore session."""
        # End the Firestore session
        self.store.end_session()

        # Close the Gemini WebSocket
        if self.gemini_ws:
            try:
                await self.gemini_ws.close()
                logger.info("[Session] Gemini WS closed")
            except Exception:
                pass
