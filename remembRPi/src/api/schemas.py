"""
Pydantic schemas for remembR API requests and responses.

Defines the data models for HTTP endpoints and WebSocket messages.
"""

from pydantic import BaseModel, Field
from typing import Any


class HealthResponse(BaseModel):
    status: str = "ok"
    pipeline_running: bool = False
    objects_tracked: int = 0
    websocket_clients: int = 0
    tailscale_connected: bool = False
    tailscale_ip: str | None = None
    tailscale_hostname: str | None = None
    uptime_seconds: float = 0.0


class BoundingBox(BaseModel):
    x: float = Field(description="Normalized x (left)")
    y: float = Field(description="Normalized y (top)")
    w: float = Field(description="Normalized width")
    h: float = Field(description="Normalized height")


class ObjectInfo(BaseModel):
    label: str
    confidence: float
    region: str
    visible_now: bool
    last_seen: float
    last_seen_iso: str
    last_seen_ago: str | None = None
    track_id: int | None = None
    bbox: BoundingBox | None = None
    total_seen_count: int = 0


class ObjectsResponse(BaseModel):
    objects: list[ObjectInfo]
    count: int
    timestamp: float


class FindRequest(BaseModel):
    label: str = Field(description="Object to search for, e.g. 'wallet', 'phone', 'keys'")


class FindResponse(BaseModel):
    type: str = "find_result"
    label: str
    query: str
    found_now: bool
    last_seen: float | None = None
    last_seen_iso: str | None = None
    last_seen_ago: str | None = None
    region: str | None = None
    confidence: float | None = None
    track_id: int | None = None
    snapshot_url: str | None = None
    message: str


class SnapshotResponse(BaseModel):
    snapshot_id: str
    url: str
    label: str | None = None
    timestamp: float


class CommandRequest(BaseModel):
    command: str
    args: dict[str, Any] = Field(default_factory=dict)


class CommandResponse(BaseModel):
    status: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class StatusResponse(BaseModel):
    server: dict
    tailscale: dict
    camera: dict
    hailo: dict
    memory: dict
