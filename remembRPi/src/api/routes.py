"""
FastAPI route definitions for remembR.

HTTP endpoints for the phone app to query object memory, request find operations,
access snapshots, and check system health.

These routes are registered in the main FastAPI app.
"""

import asyncio
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
    MedScanRequest, MedScanResponse, CarePlanResponse,
    SweepResponse, PanTiltMoveRequest,
)
from src.memory.object_memory import ObjectRecord, DetectionRecord
from src.utils.logging_utils import get_logger
from src.utils.time_utils import format_age
from src.utils.drawing_utils import draw_detections

router = APIRouter()
log = get_logger()


def _objects_to_detection_records(
    objects: list[ObjectRecord],
    display_names: dict[str, str] | None = None,
) -> list[DetectionRecord]:
    """Convert visible ObjectRecords to DetectionRecords for bounding box drawing."""
    dn = display_names or {}
    records = []
    for obj in objects:
        bbox = obj.latest_bbox
        if not bbox:
            continue
        records.append(DetectionRecord(
            label=dn.get(obj.label, obj.label),
            confidence=obj.latest_confidence,
            bbox_x=bbox.get("x", 0),
            bbox_y=bbox.get("y", 0),
            bbox_w=bbox.get("w", 0),
            bbox_h=bbox.get("h", 0),
            track_id=obj.latest_track_id,
            timestamp=obj.last_seen,
        ))
    return records


def _object_to_info(
    obj: ObjectRecord,
    display_names: dict[str, str] | None = None,
) -> ObjectInfo:
    """Convert an ObjectRecord to an API ObjectInfo response."""
    dn = display_names or {}
    bbox = None
    if obj.latest_bbox:
        bbox = BoundingBox(
            x=obj.latest_bbox.get("x", 0),
            y=obj.latest_bbox.get("y", 0),
            w=obj.latest_bbox.get("w", 0),
            h=obj.latest_bbox.get("h", 0),
        )
    return ObjectInfo(
        label=dn.get(obj.label, obj.label),
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
    dn = getattr(request.app.state, "display_names", {})
    objects = memory.get_current_objects()
    return ObjectsResponse(
        objects=[_object_to_info(o, dn) for o in objects],
        count=len(objects),
        timestamp=time.time(),
    )


@router.get("/objects/recent", response_model=ObjectsResponse)
async def get_recent_objects(request: Request, within: float = 300.0) -> ObjectsResponse:
    """Get objects seen recently (default: within last 5 minutes)."""
    memory = request.app.state.memory
    dn = getattr(request.app.state, "display_names", {})
    objects = memory.get_recent_objects(within_seconds=within)
    return ObjectsResponse(
        objects=[_object_to_info(o, dn) for o in objects],
        count=len(objects),
        timestamp=time.time(),
    )


@router.post("/find", response_model=FindResponse)
async def find_object(request: Request, body: FindRequest) -> FindResponse:
    """Search for a missing object in memory.

    The phone app sends an object name (e.g., "wallet", "phone") and the
    backend searches current and recent memory for that object class.
    Optionally triggers a pan-tilt sweep before searching.
    """
    finder = request.app.state.finder
    runner = getattr(request.app.state, "hailo_runner", None)
    snapshot_dir = getattr(request.app.state, "snapshot_dir", "data/snapshots")
    pan_tilt = getattr(request.app.state, "pan_tilt_service", None)
    lidar = getattr(request.app.state, "lidar_service", None)
    esp32_state = getattr(request.app.state, "esp32_state_service", None)

    # Set companion state to searching
    if esp32_state:
        await esp32_state.set_state("searching")

    # Trigger sweep if requested and pan-tilt is available
    if body.sweep and pan_tilt and pan_tilt.available:
        await pan_tilt.sweep()

    result = finder.find(body.label)

    # Add LiDAR distance if available
    if lidar and lidar.available:
        dist_info = lidar.get_distance()
        if dist_info.get("distance_m") is not None:
            result["distance_m"] = dist_info["distance_m"]
            result["distance_text"] = dist_info["distance_text"]

    # Resolve the COCO label for snapshot lookup
    resolved_label = finder.resolve_label(body.label)

    # If the object is visible right now, wait 500ms for the frame to
    # stabilise then take a snapshot.
    if result.get("found_now") and runner:
        await asyncio.sleep(0.5)
        frame = runner.get_latest_frame()
        if frame is not None:
            memory = request.app.state.memory
            dn = getattr(request.app.state, "display_names", {})
            # Use all recently-seen objects for bounding box drawing
            all_objects = memory.get_all_objects()
            recent_objects = [
                o for o in all_objects
                if (time.time() - o.last_seen) < 5.0
            ]
            detections = _objects_to_detection_records(recent_objects, dn)
            snapshot_url = _save_snapshot(frame, body.label, snapshot_dir, request,
                                         detections=detections, quality=65)
            result["snapshot_url"] = snapshot_url

            # Store for subsequent polling
            latest_snapshots = getattr(request.app.state, "latest_snapshots", {})
            latest_snapshots[resolved_label] = snapshot_url

    # If we don't have a snapshot_url yet but a previous find stored one,
    # return it so the mobile app's polling picks it up.
    if not result.get("snapshot_url"):
        latest_snapshots = getattr(request.app.state, "latest_snapshots", {})
        stored_url = latest_snapshots.get(resolved_label)
        if stored_url:
            result["snapshot_url"] = stored_url

    # Set companion state based on result
    if esp32_state:
        if result.get("found_now"):
            await esp32_state.set_state("found")
        else:
            await esp32_state.set_state("idle")

    return FindResponse(**result)


# ---- Medication verification ----

@router.post("/med/scan", response_model=MedScanResponse)
async def med_scan(request: Request, body: MedScanRequest) -> MedScanResponse:
    """Verify a medication barcode or name against the care plan.

    Accepts either a barcode string or medication name.
    Returns match/mismatch/uncertain with a safety notice.

    This endpoint NEVER diagnoses, prescribes, or tells the user to take
    or skip medication.
    """
    care_plan = getattr(request.app.state, "care_plan_service", None)
    if care_plan is None:
        return MedScanResponse(
            status="uncertain",
            safety_notice="Please confirm with your caregiver, pharmacist, or clinician.",
            message="Medication verification service is not available.",
        )

    if body.barcode:
        result = care_plan.verify_barcode(body.barcode)
    elif body.medication_name:
        result = care_plan.verify_name(body.medication_name)
    else:
        return MedScanResponse(
            status="uncertain",
            safety_notice="Please confirm with your caregiver, pharmacist, or clinician.",
            message="Please provide a barcode or medication name to verify.",
        )

    return MedScanResponse(**result)


@router.get("/med/plan", response_model=CarePlanResponse)
async def get_care_plan(request: Request) -> CarePlanResponse:
    """Get the current care plan summary (medication list)."""
    care_plan = getattr(request.app.state, "care_plan_service", None)
    if care_plan is None:
        return CarePlanResponse(loaded=False)
    return CarePlanResponse(**care_plan.get_plan_summary())


# ---- Pan-tilt control ----

@router.post("/pantilt/sweep", response_model=SweepResponse)
async def sweep(request: Request) -> SweepResponse:
    """Trigger a full pan-tilt room sweep."""
    pan_tilt = getattr(request.app.state, "pan_tilt_service", None)
    if pan_tilt is None or not pan_tilt.available:
        return SweepResponse(status="unavailable", message="Pan-tilt controller not connected")

    esp32_state = getattr(request.app.state, "esp32_state_service", None)
    if esp32_state:
        await esp32_state.set_state("searching")

    result = await pan_tilt.sweep()

    if esp32_state:
        await esp32_state.set_state("idle")

    return SweepResponse(**result)


@router.post("/pantilt/center")
async def pantilt_center(request: Request):
    """Center the pan-tilt servos."""
    pan_tilt = getattr(request.app.state, "pan_tilt_service", None)
    if pan_tilt is None or not pan_tilt.available:
        return {"status": "unavailable", "message": "Pan-tilt controller not connected"}
    return await pan_tilt.center()


@router.post("/pantilt/move")
async def pantilt_move(request: Request, body: PanTiltMoveRequest):
    """Move pan and/or tilt to specific positions (microseconds)."""
    pan_tilt = getattr(request.app.state, "pan_tilt_service", None)
    if pan_tilt is None or not pan_tilt.available:
        return {"status": "unavailable", "message": "Pan-tilt controller not connected"}
    results = {}
    if body.pan_us is not None:
        results["pan"] = await pan_tilt.set_pan(body.pan_us)
    if body.tilt_us is not None:
        results["tilt"] = await pan_tilt.set_tilt(body.tilt_us)
    return {"status": "ok", "results": results}


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


# ---- Barcode scanning (camera-based, with full med verification) ----

@router.post("/scan/camera")
async def scan_camera(request: Request):
    """Scan for barcodes using the camera frame, with full med pipeline.

    Grabs the latest frame from the Hailo pipeline, decodes barcodes
    (UPC_A, EAN13, CODE128, etc.) using pyzbar, then runs the full
    drug lookup (openFDA + UPCitemdb) and care plan verification.

    Test from CLI:
        curl -X POST http://localhost:8000/scan/camera
    """
    runner = getattr(request.app.state, "hailo_runner", None)
    if not runner:
        return {"status": "error", "message": "No active camera pipeline"}

    frame = runner.get_latest_frame()
    if frame is None:
        return {"status": "error", "message": "No camera frame available"}

    try:
        from pyzbar.pyzbar import decode as pyzbar_decode

        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        else:
            gray = frame

        barcodes = pyzbar_decode(gray)
    except ImportError:
        return {"status": "error", "message": "pyzbar not installed"}
    except Exception as e:
        return {"status": "error", "message": f"Barcode decode failed: {e}"}

    if not barcodes:
        return {
            "status": "no_barcode",
            "message": "No barcode detected in camera view.",
        }

    # Use the first barcode found
    bc = barcodes[0]
    barcode_data = bc.data.decode("utf-8", errors="replace")
    barcode_type = bc.type

    result = {
        "status": "found",
        "barcode": barcode_data,
        "barcode_type": barcode_type,
    }

    # Drug lookup (openFDA / UPCitemdb)
    try:
        from src.services.drug_lookup_service import scan_and_lookup, drug_info_summary
        import asyncio
        loop = asyncio.get_event_loop()
        drug = await loop.run_in_executor(None, scan_and_lookup, barcode_data)
        if drug:
            result["drug_info"] = drug
            result["drug_summary"] = drug_info_summary(drug)
        else:
            result["drug_info"] = None
            result["drug_summary"] = "No drug match found in database."
    except Exception as e:
        result["drug_info"] = None
        result["drug_summary"] = f"Drug lookup failed: {e}"

    # Care plan verification
    care_plan = getattr(request.app.state, "care_plan_service", None)
    if care_plan:
        result["care_plan_check"] = care_plan.verify_barcode(barcode_data)
    else:
        result["care_plan_check"] = {"status": "unavailable",
                                     "message": "No care plan loaded"}

    # Also list all barcodes found (in case multiple)
    result["all_barcodes"] = [
        {"data": b.data.decode("utf-8", errors="replace"), "type": b.type}
        for b in barcodes
    ]

    return result


@router.get("/scan/debug")
async def scan_debug(request: Request):
    """Capture a frame, attempt barcode decode + med lookup, save snapshot.

    Returns the barcode results, drug info, care plan check, plus a
    snapshot URL so you can see what the camera captured. Test from CLI:
        curl http://localhost:8000/scan/debug
    Then view the snapshot at the returned snapshot_url.
    """
    runner = getattr(request.app.state, "hailo_runner", None)
    if not runner:
        return {"status": "error", "message": "No active camera pipeline"}

    frame = runner.get_latest_frame()
    if frame is None:
        return {"status": "error", "message": "No camera frame available"}

    snapshot_dir = getattr(request.app.state, "snapshot_dir", "data/snapshots")
    barcode_data = None
    barcode_type = None

    try:
        from pyzbar.pyzbar import decode as pyzbar_decode

        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        else:
            gray = frame

        barcodes = pyzbar_decode(gray)

        # Draw barcode bounding boxes on the frame for the snapshot
        annotated = frame.copy()
        for bc in barcodes:
            r = bc.rect
            cv2.rectangle(annotated, (r.left, r.top),
                         (r.left + r.width, r.top + r.height),
                         (0, 255, 0), 3)
            bc_text = bc.data.decode("utf-8", errors="replace")
            cv2.putText(annotated, f"{bc.type}: {bc_text}",
                       (r.left, r.top - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        if barcodes:
            barcode_data = barcodes[0].data.decode("utf-8", errors="replace")
            barcode_type = barcodes[0].type

        snapshot_url = _save_snapshot(annotated, "barcode_debug", snapshot_dir,
                                     request, quality=60)

    except ImportError:
        snapshot_url = _save_snapshot(frame, "barcode_debug", snapshot_dir,
                                     request, quality=60)
        return {
            "status": "error",
            "message": "pyzbar not installed",
            "snapshot_url": snapshot_url,
        }
    except Exception as e:
        snapshot_url = _save_snapshot(frame, "barcode_debug", snapshot_dir,
                                     request, quality=60)
        return {
            "status": "error",
            "message": f"Barcode decode failed: {e}",
            "snapshot_url": snapshot_url,
        }

    if not barcode_data:
        return {
            "status": "no_barcode",
            "snapshot_url": snapshot_url,
            "message": "No barcode detected. Check snapshot to see camera view.",
        }

    # Full med pipeline: drug lookup + care plan
    result = {
        "status": "found",
        "barcode": barcode_data,
        "barcode_type": barcode_type,
        "snapshot_url": snapshot_url,
    }

    try:
        from src.services.drug_lookup_service import scan_and_lookup, drug_info_summary
        import asyncio
        loop = asyncio.get_event_loop()
        drug = await loop.run_in_executor(None, scan_and_lookup, barcode_data)
        if drug:
            result["drug_info"] = drug
            result["drug_summary"] = drug_info_summary(drug)
        else:
            result["drug_info"] = None
            result["drug_summary"] = "No drug match found in database."
    except Exception as e:
        result["drug_info"] = None
        result["drug_summary"] = f"Drug lookup failed: {e}"

    care_plan = getattr(request.app.state, "care_plan_service", None)
    if care_plan:
        result["care_plan_check"] = care_plan.verify_barcode(barcode_data)
    else:
        result["care_plan_check"] = {"status": "unavailable",
                                     "message": "No care plan loaded"}

    result["message"] = (
        f"Barcode: {barcode_data} ({barcode_type}). "
        f"Drug: {result['drug_summary']}"
    )

    return result


@router.get("/status", response_model=StatusResponse)
async def status(request: Request) -> StatusResponse:
    """Detailed system status for network debugging."""
    app_state = request.app.state
    ts = getattr(app_state, "tailscale_status", {})
    runner = getattr(app_state, "hailo_runner", None)
    memory = getattr(app_state, "memory", None)
    start_time = getattr(app_state, "start_time", time.time())
    pan_tilt = getattr(app_state, "pan_tilt_service", None)
    barcode = getattr(app_state, "barcode_service", None)
    care_plan = getattr(app_state, "care_plan_service", None)
    lidar = getattr(app_state, "lidar_service", None)
    esp32_state = getattr(app_state, "esp32_state_service", None)

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
            "available": True,
            "pipeline_running": runner.is_running if runner else False,
        },
        memory={
            "total_objects": len(memory.get_all_objects()) if memory else 0,
            "currently_visible": len(memory.get_current_objects()) if memory else 0,
            "recently_seen": len(memory.get_recent_objects()) if memory else 0,
        },
        pan_tilt=pan_tilt.to_status_dict() if pan_tilt else {},
        barcode=barcode.to_status_dict() if barcode else {},
        care_plan=care_plan.to_status_dict() if care_plan else {},
        lidar=lidar.to_status_dict() if lidar else {},
        companion=esp32_state.to_status_dict() if esp32_state else {},
    )


def _save_snapshot(
    frame, label: str, snapshot_dir: str, request: Request,
    detections=None, quality: int = 85,
) -> str | None:
    """Save a snapshot and return its URL.

    If detections are provided, bounding boxes and labels are drawn on the image.
    quality: JPEG quality 0-100 (higher = better quality, larger file).
    """
    try:
        Path(snapshot_dir).mkdir(parents=True, exist_ok=True)
        timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        safe_label = label.replace(" ", "_")
        snapshot_id = f"{safe_label}_{timestamp_str}_{uuid.uuid4().hex[:6]}.jpg"
        file_path = Path(snapshot_dir) / snapshot_id

        # Draw bounding boxes if detections are available
        if detections:
            frame = draw_detections(frame, detections)

        # Convert RGB to BGR for OpenCV if needed
        if frame.shape[2] == 3:
            bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        else:
            bgr = frame

        cv2.imwrite(str(file_path), bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
        log.info("Saved snapshot: %s (quality=%d)", snapshot_id, quality)

        return f"/snapshots/{snapshot_id}"
    except Exception as e:
        log.error("Failed to save snapshot: %s", e)
        return None
