"""
Message router for remembR WebSocket communication.

Parses incoming messages from the phone app and dispatches them to
the appropriate handlers (find, get_current_objects, capture_snapshot, etc.).

Message format (JSON):
  Inbound (phone -> Pi):
    {"type": "ping"}
    {"type": "find", "label": "wallet"}
    {"type": "get_current_objects"}
    {"type": "capture_snapshot"}

  Outbound (Pi -> phone):
    {"type": "pong"}
    {"type": "find_result", "label": "...", "found_now": true/false, ...}
    {"type": "objects_update", "objects": [...]}
    {"type": "snapshot_ready", "snapshot_id": "...", "url": "..."}
    {"type": "error", "message": "..."}
"""

import json
import time
from typing import Any, Callable, Awaitable

from fastapi import WebSocket

from src.utils.logging_utils import get_logger


# Type for async message handlers
MessageHandler = Callable[[WebSocket, dict], Awaitable[dict | None]]


class MessageRouter:
    """Routes incoming WebSocket messages to registered handlers."""

    def __init__(self):
        self._handlers: dict[str, MessageHandler] = {}
        self._log = get_logger()

        # Register built-in handlers
        self.register("ping", self._handle_ping)

    def register(self, message_type: str, handler: MessageHandler) -> None:
        """Register a handler for a message type."""
        self._handlers[message_type] = handler
        self._log.debug("Registered handler for message type: %s", message_type)

    async def route(self, websocket: WebSocket, raw_text: str) -> dict | None:
        """Parse and route an incoming WebSocket message.

        Args:
            websocket: The client WebSocket.
            raw_text: Raw JSON text from the client.

        Returns:
            Response dict to send back, or None if no response needed.
        """
        try:
            message = json.loads(raw_text)
        except json.JSONDecodeError:
            self._log.warning("Invalid JSON from client: %s", raw_text[:100])
            return {"type": "error", "message": "Invalid JSON"}

        msg_type = message.get("type")
        if not msg_type:
            return {"type": "error", "message": "Missing 'type' field"}

        handler = self._handlers.get(msg_type)
        if handler is None:
            self._log.warning("Unknown message type: %s", msg_type)
            return {"type": "error", "message": f"Unknown message type: {msg_type}"}

        try:
            return await handler(websocket, message)
        except Exception as e:
            self._log.error("Error handling message type '%s': %s", msg_type, e, exc_info=True)
            return {"type": "error", "message": f"Internal error handling {msg_type}"}

    async def _handle_ping(self, websocket: WebSocket, message: dict) -> dict:
        """Respond to ping with pong."""
        return {"type": "pong", "timestamp": time.time()}
