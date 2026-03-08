"""
FastAPI application for remembR.

Creates the FastAPI app with:
- HTTP routes for health, objects, find, snapshots, status
- WebSocket endpoint for real-time phone app communication
- CORS middleware for mobile app access
- Lifespan management for startup/shutdown of Hailo pipeline and persistence

The HTTP server binds to 0.0.0.0:8000 so it is reachable via Tailscale,
local LAN, and localhost.
"""

import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.api.routes import router
from src.memory.object_memory import ObjectMemoryManager, DetectionRecord
from src.memory.region_mapper import RegionMapper
from src.memory.persistence import MemoryPersistence
from src.memory.missing_finder import MissingFinder
from src.transport.websocket_manager import WebSocketManager
from src.transport.message_router import MessageRouter
from src.transport.tailscale_utils import print_connection_info
from src.camera.usb_camera_detect import get_best_usb_camera, validate_camera
from src.utils.logging_utils import setup_logging, get_logger
from src.services.pan_tilt_service import PanTiltService
from src.services.barcode_service import BarcodeService
from src.services.care_plan_service import CarePlanService
from src.services.lidar_service import LidarService
from src.services.esp32_state_service import ESP32StateService
from src.services.drug_lookup_service import scan_and_lookup as drug_scan_and_lookup, drug_info_summary


def load_config(config_path: str = "config/app_config.yaml") -> dict:
    """Load application configuration from YAML."""
    path = Path(config_path)
    if path.exists():
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


def create_app(config: dict | None = None) -> FastAPI:
    """Create and configure the FastAPI application."""

    if config is None:
        config = load_config()

    # Setup logging
    log_cfg = config.get("logging", {})
    setup_logging(
        level=log_cfg.get("level", "INFO"),
        log_file=log_cfg.get("file"),
        max_bytes=log_cfg.get("max_bytes", 10_485_760),
        backup_count=log_cfg.get("backup_count", 3),
    )
    log = get_logger()

    # Resolve camera device
    cam_cfg = config.get("camera", {})
    camera_device = cam_cfg.get("device", "auto")
    if camera_device is None:
        log.warning("Camera disabled via config. Pipeline will not start.")
    elif camera_device == "auto":
        camera_device = get_best_usb_camera()
        if camera_device is None:
            log.warning("No USB camera found. Pipeline will not start.")
    elif not validate_camera(camera_device):
        log.warning("Camera device %s is not valid. Pipeline will not start.", camera_device)
        camera_device = None

    # Build memory components
    det_cfg = config.get("detection", {})
    mem_cfg = config.get("memory", {})
    region_cfg = config.get("regions", {})
    snap_cfg = config.get("snapshots", {})

    region_mapper = RegionMapper.from_config(region_cfg)

    memory = ObjectMemoryManager(
        region_mapper=region_mapper,
        max_objects=mem_cfg.get("max_objects", 500),
        max_history_per_object=mem_cfg.get("max_history_per_object", 50),
        debounce_window=det_cfg.get("debounce_window", 5),
        debounce_min_hits=det_cfg.get("debounce_min_hits", 3),
        confidence_threshold=det_cfg.get("confidence_threshold", 0.45),
        label_thresholds=det_cfg.get("label_thresholds", {}),
        allowed_labels=set(det_cfg.get("allowed_labels", [])) or None,
        min_bbox_area_ratio=det_cfg.get("min_bbox_area_ratio", 0.015),
        stale_threshold_seconds=mem_cfg.get("stale_threshold_seconds", 300.0),
    )

    persistence = MemoryPersistence(
        memory=memory,
        store_path=mem_cfg.get("store_path", "data/memory_store.json"),
        interval_seconds=mem_cfg.get("persist_interval_seconds", 30.0),
    )

    finder = MissingFinder.from_config(memory=memory, config_path="config/labels.yaml")

    # Load display name overrides (e.g. handbag -> wallet)
    display_names: dict[str, str] = {}
    try:
        with open("config/labels.yaml") as _f:
            _ldata = yaml.safe_load(_f)
        if _ldata and "display_names" in _ldata:
            display_names = _ldata["display_names"]
    except Exception:
        pass

    ws_manager = WebSocketManager()
    msg_router = MessageRouter()

    snapshot_dir = snap_cfg.get("directory", "data/snapshots")
    Path(snapshot_dir).mkdir(parents=True, exist_ok=True)

    hailo_cfg = config.get("hailo", {})
    server_cfg = config.get("server", {})
    port = server_cfg.get("port", 8000)

    # Initialize new services
    esp32_cfg = config.get("esp32", {})
    esp32_host = esp32_cfg.get("host", "192.168.1.135")
    esp32_port = esp32_cfg.get("port", 8080)

    pan_tilt_service = PanTiltService(
        esp32_host=esp32_host,
        esp32_port=esp32_port,
        timeout=esp32_cfg.get("sweep_timeout", 30.0),
    )
    care_plan_service = CarePlanService(
        care_plan_path=config.get("care_plan", {}).get("path", "config/care_plan.json"),
    )

    # Barcode scanner: wire physical scans directly to care plan + WS broadcast
    def _on_physical_barcode(barcode: str) -> None:
        """Called by BarcodeService when the physical scanner reads a barcode.
        Verifies against care plan and pushes result to all WebSocket clients."""
        result = care_plan_service.verify_barcode(barcode)
        result["type"] = "med_scan_result"
        loop = app_state.get("event_loop")
        if loop and ws_manager.client_count > 0:
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast(result),
                loop,
            )

    barcode_service = BarcodeService(
        device_path=config.get("barcode", {}).get("device"),
        on_scan=_on_physical_barcode,
    )
    lidar_cfg = config.get("lidar", {})
    lidar_service = LidarService(
        port=lidar_cfg.get("port", "/dev/ttyAMA0"),
        baudrate=lidar_cfg.get("baudrate", 115200),
    )
    esp32_state_service = ESP32StateService(
        esp32_host=esp32_host,
        esp32_port=esp32_port,
    )

    # Store all state for access from routes and WebSocket handlers
    app_state = {
        "config": config,
        "memory": memory,
        "persistence": persistence,
        "finder": finder,
        "display_names": display_names,
        "ws_manager": ws_manager,
        "msg_router": msg_router,
        "region_mapper": region_mapper,
        "camera_device": camera_device,
        "snapshot_dir": snapshot_dir,
        "hailo_runner": None,
        "tailscale_status": {},
        "start_time": time.time(),
        "port": port,
        "event_loop": None,
        "pan_tilt_service": pan_tilt_service,
        "barcode_service": barcode_service,
        "care_plan_service": care_plan_service,
        "lidar_service": lidar_service,
        "esp32_state_service": esp32_state_service,
        # Latest snapshot URL per label, so polling POST /find can return it
        "latest_snapshots": {},
    }

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Startup and shutdown lifecycle for the app."""
        log.info("remembR starting up...")

        # Store event loop for cross-thread WebSocket broadcasts
        app_state["event_loop"] = asyncio.get_event_loop()

        # Apply state to app
        for key, value in app_state.items():
            setattr(app.state, key, value)

        # Load persisted memory from disk
        persistence.load()

        # Print Tailscale connection info
        ts_status = print_connection_info(port=port)
        app.state.tailscale_status = ts_status

        # Start persistence background thread
        persistence.start()

        # Initialize new services (non-blocking, graceful degradation)
        # Care plan
        care_plan_service.load()

        # ESP32 pan-tilt connection check
        await pan_tilt_service.check_connection()
        esp32_state_service.set_available(pan_tilt_service.available)

        # Barcode scanner (optional hardware)
        barcode_service.start()

        # LiDAR (optional hardware)
        if lidar_cfg.get("enabled", False):
            lidar_service.start()

        # Start Hailo detection pipeline if camera is available
        if camera_device:
            try:
                from src.hailo.hailo_runner import HailoRunner

                runner = HailoRunner(
                    memory=memory,
                    camera_device=camera_device,
                    hailo_examples_path=hailo_cfg.get("examples_path"),
                    arch=hailo_cfg.get("arch", "auto"),
                )

                if runner.start():
                    app.state.hailo_runner = runner
                    log.info("Hailo detection pipeline started successfully")
                else:
                    log.warning("Hailo pipeline failed to start. "
                               "Running in API-only mode (no live detections).")
            except ImportError as e:
                log.warning("Hailo modules not available: %s. "
                           "Running in API-only mode.", e)
            except Exception as e:
                log.error("Failed to start Hailo runner: %s", e, exc_info=True)
        else:
            log.warning("No camera device. Running in API-only mode.")

        log.info("remembR ready")
        yield

        # Shutdown
        log.info("remembR shutting down...")
        runner = app.state.hailo_runner
        if runner:
            runner.stop()
        barcode_service.stop()
        lidar_service.stop()
        persistence.stop()
        log.info("remembR stopped")

    app = FastAPI(
        title="remembR",
        description="Edge AI missing-object finder backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS - allow all origins for mobile app access
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount static files
    Path(snapshot_dir).mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory="static"), name="static_files")

    # Include HTTP routes (must be before snapshot mount so /snapshots/{id} route works)
    app.include_router(router)

    # Mount snapshots directory as static files fallback for serving JPEGs
    # The route handler in routes.py handles /snapshots/{id} with security checks;
    # this mount serves as a direct static fallback.
    app.mount("/snapshots", StaticFiles(directory=snapshot_dir), name="snapshots")

    # Register WebSocket message handlers
    async def handle_find(websocket: WebSocket, message: dict) -> dict | None:
        label = message.get("label", "")
        if not label:
            return {"type": "error", "message": "Missing 'label' field for find"}
        result = finder.find(label)

        # If found now, send the find result immediately so the phone
        # knows we spotted the object, then wait 500ms for the frame to
        # stabilise and take a snapshot.
        if result.get("found_now"):
            # 1. Send the find result right away
            await ws_manager.send_to(websocket, result)

            # 2. Schedule the delayed snapshot
            async def _delayed_snapshot():
                await asyncio.sleep(0.5)
                runner = getattr(app.state, "hailo_runner", None)
                if not runner:
                    return
                frame = runner.get_latest_frame()
                if frame is None:
                    return

                from src.api.routes import _save_snapshot, _objects_to_detection_records
                # Get all recently-seen objects for bounding box drawing
                all_objects = memory.get_all_objects()
                recent_objects = [
                    o for o in all_objects
                    if (time.time() - o.last_seen) < 5.0
                ]
                detections = _objects_to_detection_records(recent_objects, display_names)

                # Save snapshot to disk and get URL path
                url = _save_snapshot(frame, label, snapshot_dir, None,
                                     detections=detections, quality=65)

                if url:
                    # Store for subsequent polling via POST /find
                    app_state["latest_snapshots"][label] = url

                    await ws_manager.send_to(websocket, {
                        "type": "find_snapshot_ready",
                        "url": url,
                        "label": label,
                        "timestamp": time.time(),
                    })

            asyncio.create_task(_delayed_snapshot())
            # Return None — we already sent the find result above
            return None

        return result

    async def handle_get_current(websocket: WebSocket, message: dict) -> dict:
        objects = memory.get_current_objects()
        dicts = []
        for o in objects:
            d = o.to_dict()
            d["label"] = display_names.get(d["label"], d["label"])
            dicts.append(d)
        return {
            "type": "objects_update",
            "objects": dicts,
            "timestamp": time.time(),
        }

    async def handle_capture_snapshot(websocket: WebSocket, message: dict) -> dict:
        runner = getattr(app.state, "hailo_runner", None)
        if not runner:
            return {"type": "error", "message": "No active detection pipeline"}
        frame = runner.get_latest_frame()
        if frame is None:
            return {"type": "error", "message": "No frame available"}

        from src.api.routes import _save_snapshot, _objects_to_detection_records
        current_objects = memory.get_current_objects()
        detections = _objects_to_detection_records(current_objects, display_names)
        url = _save_snapshot(frame, "manual", snapshot_dir, None, detections=detections)
        if url:
            snapshot_id = Path(url).name
            return {
                "type": "snapshot_ready",
                "snapshot_id": snapshot_id,
                "url": url,
                "timestamp": time.time(),
            }
        return {"type": "error", "message": "Failed to capture snapshot"}

    msg_router.register("find", handle_find)
    msg_router.register("find_object", handle_find)  # alias
    msg_router.register("get_current_objects", handle_get_current)
    msg_router.register("capture_snapshot", handle_capture_snapshot)

    # New WebSocket handlers for MVP

    async def handle_get_recent_objects(websocket: WebSocket, message: dict) -> dict:
        within = message.get("within", 300)
        objects = memory.get_recent_objects(within_seconds=within)
        dicts = []
        for o in objects:
            d = o.to_dict()
            d["label"] = display_names.get(d["label"], d["label"])
            dicts.append(d)
        return {
            "type": "recent_objects",
            "objects": dicts,
            "within_seconds": within,
            "timestamp": time.time(),
        }

    async def handle_start_med_scan(websocket: WebSocket, message: dict) -> dict:
        barcode = message.get("barcode")
        medication_name = message.get("medication_name")

        if barcode:
            result = care_plan_service.verify_barcode(barcode)
        elif medication_name:
            result = care_plan_service.verify_name(medication_name)
        else:
            return {
                "type": "med_scan_result",
                "status": "uncertain",
                "safety_notice": "Please confirm with your caregiver, pharmacist, or clinician.",
                "message": "Please provide a barcode or medication name.",
            }

        result["type"] = "med_scan_result"
        return result

    async def handle_sweep(websocket: WebSocket, message: dict) -> dict:
        if not pan_tilt_service.available:
            return {"type": "error", "message": "Pan-tilt controller not connected"}
        await esp32_state_service.set_state("searching")
        result = await pan_tilt_service.sweep()
        await esp32_state_service.set_state("idle")
        result["type"] = "sweep_result"
        return result

    async def handle_scan(websocket: WebSocket, message: dict) -> dict:
        """Handle a barcode scan request from the phone.

        Grabs the latest camera frame, decodes any barcodes using pyzbar,
        then looks up the barcode via openFDA / UPC databases and returns
        the drug/product info to the phone.
        """
        runner = getattr(app.state, "hailo_runner", None)
        if not runner:
            return {"type": "scan_result", "status": "error",
                    "message": "No active camera pipeline"}

        frame = runner.get_latest_frame()
        if frame is None:
            return {"type": "scan_result", "status": "error",
                    "message": "No camera frame available"}

        # Decode barcodes from the camera frame
        try:
            from pyzbar.pyzbar import decode as pyzbar_decode
            import cv2

            # Convert to grayscale for better barcode detection
            if len(frame.shape) == 3:
                gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
            else:
                gray = frame

            barcodes = pyzbar_decode(gray)
        except ImportError:
            return {"type": "scan_result", "status": "error",
                    "message": "pyzbar not installed on server"}
        except Exception as e:
            log.error("Barcode decode error: %s", e)
            return {"type": "scan_result", "status": "error",
                    "message": f"Barcode decode failed: {e}"}

        if not barcodes:
            return {"type": "scan_result", "status": "no_barcode",
                    "message": "No barcode detected in camera view. "
                               "Hold the barcode steady in front of the camera and try again."}

        # Use the first barcode found
        bc = barcodes[0]
        barcode_data = bc.data.decode("utf-8", errors="replace")
        barcode_type = bc.type  # e.g. EAN13, UPCA, CODE128, etc.

        log.info("Barcode detected: %s (type: %s)", barcode_data, barcode_type)

        # Look up in drug databases (runs network requests — done in thread)
        loop = asyncio.get_event_loop()
        drug = await loop.run_in_executor(None, drug_scan_and_lookup, barcode_data)

        if drug:
            return {
                "type": "scan_result",
                "status": "found",
                "barcode": barcode_data,
                "barcode_type": barcode_type,
                "drug_info": drug,
                "summary": drug_info_summary(drug),
                "message": f"Found: {drug['brand_name']} ({drug['generic_name']})",
            }

        # Barcode decoded but no drug match — still return the raw barcode
        return {
            "type": "scan_result",
            "status": "barcode_only",
            "barcode": barcode_data,
            "barcode_type": barcode_type,
            "drug_info": None,
            "message": f"Barcode scanned: {barcode_data} ({barcode_type}). "
                       "No matching drug found in database.",
        }

    msg_router.register("get_recent_objects", handle_get_recent_objects)
    msg_router.register("start_med_scan", handle_start_med_scan)
    msg_router.register("sweep", handle_sweep)
    msg_router.register("scan", handle_scan)

    # WebSocket endpoint
    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                raw = await websocket.receive_text()
                response = await msg_router.route(websocket, raw)
                if response is not None:
                    await ws_manager.send_to(websocket, response)
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)
        except Exception as e:
            log.error("WebSocket error: %s", e)
            ws_manager.disconnect(websocket)

    return app
