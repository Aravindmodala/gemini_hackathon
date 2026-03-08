"""
Bidirectional audio relay between browser and Gemini Live API.

Handles:
  - Audio streaming in both directions
  - Text capture for Firestore logging
  - Tool call interception, dispatch, and response routing
  - Turn management signals
"""

import json
import logging

import websockets
from fastapi import WebSocket, WebSocketDisconnect

from app.core.store import SessionStore
from app.tools import ToolRegistry

logger = logging.getLogger("chronicler")


async def relay_gemini_to_client(
    gemini_ws,
    client_ws: WebSocket,
    registry: ToolRegistry,
    store: SessionStore,
):
    """
    Forward messages from the Gemini Live API → browser.

    Handles:
      - setupComplete → tells browser the session is ready
      - toolCall → dispatches to registry, sends result back to Gemini, logs to Firestore
      - serverContent.inputTranscript → logs user's speech as text
      - serverContent.modelTurn.parts[].inlineData → forwards audio
      - serverContent.modelTurn.parts[].text → logs ELORA's narration text
      - serverContent.turnComplete → signals model finished speaking
    """
    try:
        async for message in gemini_ws:
            response = json.loads(message)

            # ── Setup complete ───────────────────────────────
            if response.get("setupComplete"):
                logger.info("[Relay] Gemini setup complete")
                await client_ws.send_json({"type": "status", "status": "ready"})
                continue

            # ── Tool calls ───────────────────────────────────
            tool_call = response.get("toolCall")
            if tool_call:
                logger.info(
                    f"\n[Agent Trace] 🛠️ Tool Invoked:\n"
                    f"{json.dumps(tool_call, indent=2)}"
                )

                # Dispatch custom function calls and send responses back
                function_calls = tool_call.get("functionCalls", [])
                for fc in function_calls:
                    name = fc.get("name")
                    args = fc.get("args", {})

                    # Log tool call to Firestore
                    store.log_tool_call(name, args)

                    result = await registry.dispatch(name, **args)

                    tool_response = {
                        "toolResponse": {
                            "functionResponses": [
                                {"name": name, "response": result}
                            ]
                        }
                    }
                    await gemini_ws.send(json.dumps(tool_response))
                    logger.info(f"[Relay] Sent tool response for '{name}'")
                continue

            # ── Audio, text, and turn management ─────────────
            server_content = response.get("serverContent")
            if server_content:

                # ── User's speech transcript ─────────────────
                input_transcript = server_content.get("inputTranscript")
                if input_transcript:
                    logger.info(f"[Relay] 🗣️ User said: {input_transcript}")
                    store.log_interaction("user", input_transcript)
                    # Also send to client (for subtitles/captions)
                    await client_ws.send_json({
                        "type": "transcript",
                        "role": "user",
                        "text": input_transcript,
                    })

                # ── Model turn (audio + text) ────────────────
                model_turn = server_content.get("modelTurn")
                if model_turn:
                    parts = model_turn.get("parts", [])
                    for part in parts:
                        # Forward audio to browser
                        inline_data = part.get("inlineData")
                        if inline_data:
                            await client_ws.send_json({
                                "type": "audio",
                                "data": inline_data.get("data", ""),
                                "mimeType": inline_data.get("mimeType", ""),
                            })

                        # Capture ELORA's text and log to Firestore
                        text_content = part.get("text")
                        if text_content:
                            logger.info(
                                f"[Relay] 📜 ELORA: {text_content[:80]}..."
                            )
                            store.log_interaction("elora", text_content)
                            # Send text to client (for subtitles/captions)
                            await client_ws.send_json({
                                "type": "transcript",
                                "role": "elora",
                                "text": text_content,
                            })

                # ── Turn complete ────────────────────────────
                if server_content.get("turnComplete"):
                    await client_ws.send_json({
                        "type": "status",
                        "status": "turn_complete",
                    })

    except websockets.exceptions.ConnectionClosed:
        logger.info("[Relay] Gemini WS closed")
        try:
            await client_ws.send_json({"type": "status", "status": "disconnected"})
        except Exception:
            pass
    except Exception as e:
        logger.error(f"[Relay] Gemini relay error: {e}")


async def relay_client_to_gemini(client_ws: WebSocket, gemini_ws):
    """
    Forward audio from the browser → Gemini Live API.

    Expects messages with:
      - type: "audio"
      - data: base64-encoded 16-bit PCM at 16kHz
    """
    try:
        while True:
            data = await client_ws.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "audio" and "data" in message:
                realtime_input = {
                    "realtimeInput": {
                        "mediaChunks": [
                            {
                                "mimeType": "audio/pcm;rate=16000",
                                "data": message["data"],
                            }
                        ]
                    }
                }

                try:
                    await gemini_ws.send(json.dumps(realtime_input))
                except websockets.exceptions.ConnectionClosed:
                    logger.info("[Relay] Gemini connection closed, stopping relay")
                    break

    except WebSocketDisconnect:
        logger.info("[Relay] Browser disconnected")
    except Exception as e:
        logger.error(f"[Relay] Client relay error: {e}")
