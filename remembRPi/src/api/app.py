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

    ws_manager = WebSocketManager()
    msg_router = MessageRouter()

    snapshot_dir = snap_cfg.get("directory", "data/snapshots")
    Path(snapshot_dir).mkdir(parents=True, exist_ok=True)

    hailo_cfg = config.get("hailo", {})
    server_cfg = config.get("server", {})
    port = server_cfg.get("port", 8000)

    # Store all state for access from routes and WebSocket handlers
    app_state = {
        "config": config,
        "memory": memory,
        "persistence": persistence,
        "finder": finder,
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

        # Start Hailo detection pipeline if camera is available
        if camera_device:
            try:
                from src.hailo.hailo_runner import HailoRunner

                def on_detections(records: list[DetectionRecord]):
                    """Called by memory worker when new detections are processed.
                    Schedules a WebSocket broadcast on the async event loop."""
                    loop = app_state.get("event_loop")
                    if loop and ws_manager.client_count > 0:
                        objects = [r.to_dict() for r in records]
                        asyncio.run_coroutine_threadsafe(
                            ws_manager.broadcast_objects_update(objects),
                            loop,
                        )

                runner = HailoRunner(
                    memory=memory,
                    camera_device=camera_device,
                    hailo_examples_path=hailo_cfg.get("examples_path"),
                    arch=hailo_cfg.get("arch", "auto"),
                    on_detections=on_detections,
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

    # Mount static files for snapshots
    Path(snapshot_dir).mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory="static"), name="static_files")

    # Include HTTP routes
    app.include_router(router)

    # Register WebSocket message handlers
    async def handle_find(websocket: WebSocket, message: dict) -> dict:
        label = message.get("label", "")
        if not label:
            return {"type": "error", "message": "Missing 'label' field for find"}
        result = finder.find(label)

        # Try to include snapshot if found now
        runner = getattr(app.state, "hailo_runner", None)
        if result.get("found_now") and runner:
            frame = runner.get_latest_frame()
            if frame is not None:
                from src.api.routes import _save_snapshot
                # Build a mock request for URL generation
                url = _save_snapshot(frame, label, snapshot_dir, None)
                if url:
                    result["snapshot_url"] = url

        return result

    async def handle_get_current(websocket: WebSocket, message: dict) -> dict:
        objects = memory.get_current_objects()
        return {
            "type": "objects_update",
            "objects": [o.to_dict() for o in objects],
            "timestamp": time.time(),
        }

    async def handle_capture_snapshot(websocket: WebSocket, message: dict) -> dict:
        runner = getattr(app.state, "hailo_runner", None)
        if not runner:
            return {"type": "error", "message": "No active detection pipeline"}
        frame = runner.get_latest_frame()
        if frame is None:
            return {"type": "error", "message": "No frame available"}

        from src.api.routes import _save_snapshot
        import uuid
        url = _save_snapshot(frame, "manual", snapshot_dir, None)
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
    msg_router.register("get_current_objects", handle_get_current)
    msg_router.register("capture_snapshot", handle_capture_snapshot)

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
