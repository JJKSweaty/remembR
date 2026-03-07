"""
FastAPI route definitions for remembR.

HTTP endpoints for the phone app to query object memory, request find operations,
access snapshots, and check system health.

These routes are registered in the main FastAPI app.
"""

import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from src.api.schemas import (
    HealthResponse, ObjectsResponse, ObjectInfo, BoundingBox,
    FindRequest, FindResponse, SnapshotResponse,
    CommandRequest, CommandResponse, StatusResponse,
)
from src.memory.object_memory import ObjectRecord
from src.utils.logging_utils import get_logger
from src.utils.time_utils import format_age
from src.utils.drawing_utils import draw_detections

router = APIRouter()
log = get_logger()


def _object_to_info(obj: ObjectRecord) -> ObjectInfo:
    """Convert an ObjectRecord to an API ObjectInfo response."""
    bbox = None
    if obj.latest_bbox:
        bbox = BoundingBox(
            x=obj.latest_bbox.get("x", 0),
            y=obj.latest_bbox.get("y", 0),
            w=obj.latest_bbox.get("w", 0),
            h=obj.latest_bbox.get("h", 0),
        )
    return ObjectInfo(
        label=obj.label,
        confidence=round(obj.latest_confidence, 3),
        region=obj.latest_region,
        visible_now=obj.visible_now,
        last_seen=obj.last_seen,
        last_seen_iso=datetime.fromtimestamp(
            obj.last_seen, tz=timezone.utc
        ).isoformat(),
        last_seen_ago=format_age(
            datetime.fromtimestamp(obj.last_seen, tz=timezone.utc)
        ),
        track_id=obj.latest_track_id,
        bbox=bbox,
        total_seen_count=obj.total_seen_count,
    )


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """Health check endpoint."""
    app_state = request.app.state
    ts = getattr(app_state, "tailscale_status", {})
    start_time = getattr(app_state, "start_time", time.time())
    runner = getattr(app_state, "hailo_runner", None)
    memory = getattr(app_state, "memory", None)
    ws_manager = getattr(app_state, "ws_manager", None)

    return HealthResponse(
        status="ok",
        pipeline_running=runner.is_running if runner else False,
        objects_tracked=len(memory.get_all_objects()) if memory else 0,
        websocket_clients=ws_manager.client_count if ws_manager else 0,
        tailscale_connected=ts.get("connected", False),
        tailscale_ip=ts.get("ip"),
        tailscale_hostname=ts.get("hostname"),
        uptime_seconds=round(time.time() - start_time, 1),
    )


@router.get("/objects/current", response_model=ObjectsResponse)
async def get_current_objects(request: Request) -> ObjectsResponse:
    """Get objects currently visible in the camera feed."""
    memory = request.app.state.memory
    objects = memory.get_current_objects()
    return ObjectsResponse(
        objects=[_object_to_info(o) for o in objects],
        count=len(objects),
        timestamp=time.time(),
    )


@router.get("/objects/recent", response_model=ObjectsResponse)
async def get_recent_objects(request: Request, within: float = 300.0) -> ObjectsResponse:
    """Get objects seen recently (default: within last 5 minutes)."""
    memory = request.app.state.memory
    objects = memory.get_recent_objects(within_seconds=within)
    return ObjectsResponse(
        objects=[_object_to_info(o) for o in objects],
        count=len(objects),
        timestamp=time.time(),
    )


@router.post("/find", response_model=FindResponse)
async def find_object(request: Request, body: FindRequest) -> FindResponse:
    """Search for a missing object in memory.

    The phone app sends an object name (e.g., "wallet", "phone") and the
    backend searches current and recent memory for that object class.
    """
    finder = request.app.state.finder
    runner = getattr(request.app.state, "hailo_runner", None)
    snapshot_dir = getattr(request.app.state, "snapshot_dir", "data/snapshots")

    # Try to capture a snapshot if the object is currently visible
    snapshot_url = None
    result = finder.find(body.label)

    if result.get("found_now") and runner:
        frame = runner.get_latest_frame()
        if frame is not None:
            snapshot_url = _save_snapshot(frame, body.label, snapshot_dir, request)
            result["snapshot_url"] = snapshot_url

    return FindResponse(**result)


@router.get("/snapshots/{snapshot_id}")
async def get_snapshot(snapshot_id: str, request: Request):
    """Serve a saved snapshot image file."""
    snapshot_dir = getattr(request.app.state, "snapshot_dir", "data/snapshots")
    # Sanitize: only allow alphanumeric, dash, underscore, dot
    safe_id = "".join(c for c in snapshot_id if c.isalnum() or c in "-_.")
    file_path = Path(snapshot_dir) / safe_id

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Snapshot not found")
    if not str(file_path.resolve()).startswith(str(Path(snapshot_dir).resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(str(file_path), media_type="image/jpeg")


@router.post("/command", response_model=CommandResponse)
async def command(request: Request, body: CommandRequest) -> CommandResponse:
    """Generic command endpoint for future extensibility.

    Supported commands: status, clear_memory, force_persist.
    """
    memory = request.app.state.memory
    persistence = getattr(request.app.state, "persistence", None)

    if body.command == "status":
        return CommandResponse(
            status="ok",
            message="System operational",
            data={
                "objects_count": len(memory.get_all_objects()),
                "current_visible": len(memory.get_current_objects()),
            },
        )
    elif body.command == "clear_memory":
        memory._objects.clear()
        return CommandResponse(status="ok", message="Memory cleared")
    elif body.command == "force_persist":
        if persistence:
            persistence.save()
        return CommandResponse(status="ok", message="Memory persisted to disk")
    else:
        return CommandResponse(
            status="error",
            message=f"Unknown command: {body.command}",
        )


@router.get("/status", response_model=StatusResponse)
async def status(request: Request) -> StatusResponse:
    """Detailed system status for network debugging."""
    app_state = request.app.state
    ts = getattr(app_state, "tailscale_status", {})
    runner = getattr(app_state, "hailo_runner", None)
    memory = getattr(app_state, "memory", None)
    start_time = getattr(app_state, "start_time", time.time())

    import socket
    return StatusResponse(
        server={
            "hostname": socket.gethostname(),
            "uptime_seconds": round(time.time() - start_time, 1),
            "port": getattr(app_state, "port", 8000),
        },
        tailscale=ts,
        camera={
            "device": getattr(app_state, "camera_device", "unknown"),
            "pipeline_running": runner.is_running if runner else False,
        },
        hailo={
            "available": True,  # If we got this far
            "pipeline_running": runner.is_running if runner else False,
        },
        memory={
            "total_objects": len(memory.get_all_objects()) if memory else 0,
            "currently_visible": len(memory.get_current_objects()) if memory else 0,
            "recently_seen": len(memory.get_recent_objects()) if memory else 0,
        },
    )


def _save_snapshot(
    frame, label: str, snapshot_dir: str, request: Request,
) -> str | None:
    """Save an annotated snapshot and return its URL."""
    try:
        Path(snapshot_dir).mkdir(parents=True, exist_ok=True)
        timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        snapshot_id = f"{label}_{timestamp_str}_{uuid.uuid4().hex[:6]}.jpg"
        file_path = Path(snapshot_dir) / snapshot_id

        # Convert RGB to BGR for OpenCV if needed
        if frame.shape[2] == 3:
            bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        else:
            bgr = frame

        cv2.imwrite(str(file_path), bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
        log.info("Saved snapshot: %s", snapshot_id)

        return f"/snapshots/{snapshot_id}"
    except Exception as e:
        log.error("Failed to save snapshot: %s", e)
        return None
