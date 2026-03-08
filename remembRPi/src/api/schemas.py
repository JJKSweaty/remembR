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
    sweep: bool = Field(default=False, description="If true, trigger pan-tilt sweep before searching")


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
    distance_m: float | None = None
    distance_text: str | None = None
    message: str


class SnapshotResponse(BaseModel):
    snapshot_id: str
    url: str
    label: str | None = None
    timestamp: float


# ---- Medication verification ----

class MedScanRequest(BaseModel):
    barcode: str | None = Field(default=None, description="Scanned barcode string")
    medication_name: str | None = Field(default=None, description="Medication name for name-based lookup")


class MedScanResponse(BaseModel):
    type: str = "med_scan_result"
    status: str = Field(description="match | mismatch | uncertain")
    barcode: str | None = None
    medication_name: str | None = None
    dosage: str | None = None
    plan_slot: str | None = None
    confidence: float = 0.0
    safety_notice: str
    message: str


class CarePlanResponse(BaseModel):
    loaded: bool
    medication_count: int = 0
    medications: list[dict] = Field(default_factory=list)


# ---- Pan-tilt ----

class SweepResponse(BaseModel):
    status: str
    message: str
    duration_seconds: float | None = None


class PanTiltMoveRequest(BaseModel):
    pan_us: int | None = Field(default=None, ge=520, le=2520, description="Pan position in microseconds")
    tilt_us: int | None = Field(default=None, ge=200, le=1700, description="Tilt position in microseconds")


# ---- Generic ----

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
    pan_tilt: dict = Field(default_factory=dict)
    barcode: dict = Field(default_factory=dict)
    care_plan: dict = Field(default_factory=dict)
    lidar: dict = Field(default_factory=dict)
    companion: dict = Field(default_factory=dict)
