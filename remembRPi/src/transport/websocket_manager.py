"""
WebSocket connection manager for remembR.

Manages connected phone app clients, handles message routing, and supports
broadcast of detection events, find results, and snapshot notifications.

Follows a similar pattern to SecondSight's ConnectionManager but focused
on the backend role (no frontend logic here).
"""

import asyncio
import json
import time
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from src.utils.logging_utils import get_logger


class WebSocketManager:
    """Manages WebSocket connections from phone app clients.

    Thread-safe for concurrent access from the API layer and
    background detection event handlers.
    """

    def __init__(self):
        self._connections: list[WebSocket] = []
        self._log = get_logger()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self._connections.append(websocket)
        self._log.info("WebSocket client connected (%d total)", len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected client."""
        if websocket in self._connections:
            self._connections.remove(websocket)
        self._log.info("WebSocket client disconnected (%d remaining)", len(self._connections))

    @property
    def client_count(self) -> int:
        return len(self._connections)

    async def broadcast(self, message: dict) -> None:
        """Send a JSON message to all connected clients.

        Removes dead connections on send failure.
        """
        if not self._connections:
            return

        text = json.dumps(message)
        dead: list[WebSocket] = []

        for ws in self._connections:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    async def send_to(self, websocket: WebSocket, message: dict) -> None:
        """Send a JSON message to a specific client."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            self._log.error("Failed to send to client: %s", e)
            self.disconnect(websocket)

    async def broadcast_objects_update(self, objects: list[dict]) -> None:
        """Broadcast current object detections to all clients."""
        await self.broadcast({
            "type": "objects_update",
            "objects": objects,
            "timestamp": time.time(),
        })

    async def broadcast_find_result(self, result: dict) -> None:
        """Broadcast a find result to all clients."""
        await self.broadcast(result)

    async def broadcast_snapshot_ready(self, snapshot_id: str, url: str) -> None:
        """Notify clients that a snapshot is available."""
        await self.broadcast({
            "type": "snapshot_ready",
            "snapshot_id": snapshot_id,
            "url": url,
            "timestamp": time.time(),
        })

    async def broadcast_error(self, message: str) -> None:
        """Broadcast an error message to all clients."""
        await self.broadcast({
            "type": "error",
            "message": message,
            "timestamp": time.time(),
        })
