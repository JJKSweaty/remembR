"""
Hailo runner - high-level orchestrator for detection pipeline + consumer worker.

The producer-consumer pattern:
1. GStreamer pipeline callback (producer) extracts detections per frame
   and puts them in a thread-safe queue.
2. A memory worker thread (consumer) reads from the queue and updates
   the ObjectMemoryManager.

This separation ensures the GStreamer callback stays fast and non-blocking,
as required by the Hailo pipeline architecture.
"""

import queue
import threading
import time
from typing import Callable

import numpy as np

from src.hailo.hailo_detection_app import HailoDetectionApp, setup_hailo_env
from src.hailo.callback_handlers import RawDetection
from src.memory.object_memory import DetectionRecord, ObjectMemoryManager
from src.camera.camera_settings import (
    CameraSettings,
    load_camera_settings,
    resolve_camera_mode,
    apply_v4l2_mode,
    get_active_v4l2_mode,
)
from src.utils.logging_utils import get_logger
from src.utils.time_utils import now_utc


class HailoRunner:
    """Orchestrates the Hailo detection pipeline and memory worker.

    Attributes:
        memory: The shared ObjectMemoryManager.
        detection_queue: Thread-safe queue bridging callback and memory worker.
    """

    def __init__(
        self,
        memory: ObjectMemoryManager,
        camera_device: str = "/dev/video0",
        camera_settings: CameraSettings | None = None,
        hailo_examples_path: str | None = None,
        arch: str = "auto",
        on_detections: Callable[[list[DetectionRecord]], None] | None = None,
        on_frame: Callable[[np.ndarray | None], None] | None = None,
    ):
        """
        Args:
            memory: Object memory to update with detections.
            camera_device: USB camera path.
            camera_settings: Low-latency camera tuning config.
            hailo_examples_path: Path to hailo-rpi5-examples repo.
            arch: Hailo architecture (e.g. "hailo8l", "hailo8"). "auto" reads
                  hailo_arch from the Hailo .env file.
            on_detections: Optional callback invoked with each batch of processed detections.
            on_frame: Optional callback invoked with captured frame (for snapshots).
        """
        self._log = get_logger()
        self.memory = memory
        self._camera_device = camera_device
        self._camera_settings = camera_settings or load_camera_settings({})
        self._hailo_examples_path = hailo_examples_path
        self._arch = arch
        self._on_detections = on_detections
        self._on_frame = on_frame
        self._active_camera_mode: dict = {}

        # Producer-consumer queue: callback pushes (detections, frame) tuples
        # Keep queue tiny so stale frames are dropped quickly for lower latency.
        self.detection_queue: queue.Queue = queue.Queue(maxsize=self._camera_settings.queue_size)
        # Shared dict for latest frame (written by callback, read by snapshot logic)
        self.frame_holder: dict = {"latest_frame": None}

        self._pipeline: HailoDetectionApp | None = None
        self._worker_thread: threading.Thread | None = None
        self._running = False

    def start(self) -> bool:
        """Set up Hailo environment and start detection pipeline + worker.

        Returns:
            True if everything started successfully.
        """
        # Set up Hailo Python environment
        if not setup_hailo_env(self._hailo_examples_path):
            self._log.error("Failed to set up Hailo environment")
            return False

        mode = resolve_camera_mode(self._camera_device, self._camera_settings)
        applied = False
        if self._camera_settings.apply_v4l2_controls:
            applied = apply_v4l2_mode(self._camera_device, mode)
            if not applied:
                self._log.warning(
                    "Could not apply v4l2 mode on %s (continuing with driver defaults)",
                    self._camera_device,
                )

        active = get_active_v4l2_mode(self._camera_device)
        self._active_camera_mode = {
            "device": self._camera_device,
            "requested": mode.as_dict(),
            "applied_v4l2": applied,
            "active_v4l2": active,
            "buffer_size": self._camera_settings.buffer_size,
            "queue_size": self._camera_settings.queue_size,
        }
        self._log.info(
            "Camera mode: requested=%s %dx%d@%sfps, source=%s, active=%s",
            mode.pixel_format,
            mode.width,
            mode.height,
            mode.frame_rate,
            mode.mode_source,
            active or "unknown",
        )

        # Start the memory worker (consumer)
        self._running = True
        self._worker_thread = threading.Thread(
            target=self._memory_worker, daemon=True, name="remembr-memory-worker",
        )
        self._worker_thread.start()

        # Start the detection pipeline (producer)
        self._pipeline = HailoDetectionApp(
            detection_queue=self.detection_queue,
            frame_holder=self.frame_holder,
            camera_device=self._camera_device,
            use_frame=True,
            frame_rate=mode.frame_rate,
            frame_width=mode.width,
            frame_height=mode.height,
            pixel_format=mode.pixel_format,
            arch=self._arch,
        )
        if not self._pipeline.start():
            self._log.error("Failed to start Hailo detection pipeline")
            self._running = False
            return False

        self._log.info("HailoRunner started: pipeline + memory worker active")
        return True

    def _memory_worker(self) -> None:
        """Consumer thread: reads detections from the queue and updates memory.

        This is where heavy processing happens - memory merging, region mapping,
        snapshot triggers, etc. - all outside the GStreamer callback.
        """
        log = self._log
        log.info("Memory worker started")
        processed_count = 0

        while self._running:
            try:
                item = self.detection_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            raw_detections: list[RawDetection]
            frame: np.ndarray | None
            raw_detections, frame = item

            # Convert raw detections to DetectionRecords
            records: list[DetectionRecord] = []
            for raw in raw_detections:
                record = DetectionRecord(
                    label=raw.label,
                    confidence=raw.confidence,
                    bbox_x=raw.bbox_x,
                    bbox_y=raw.bbox_y,
                    bbox_w=raw.bbox_w,
                    bbox_h=raw.bbox_h,
                    track_id=raw.track_id,
                    timestamp=raw.timestamp,
                )
                records.append(record)

            # Update object memory
            self.memory.ingest_detections(records)

            # Store latest frame for snapshot access
            if frame is not None:
                self.frame_holder["latest_frame"] = frame
                if self._on_frame:
                    self._on_frame(frame)

            processed_count += 1
            if processed_count % 100 == 0:
                log.debug(
                    "Memory worker: processed %d batches, %d objects in memory",
                    processed_count, len(self.memory.get_all_objects()),
                )

        log.info("Memory worker stopped after processing %d batches", processed_count)

    def get_latest_frame(self) -> np.ndarray | None:
        """Return the most recent captured frame, or None."""
        return self.frame_holder.get("latest_frame")

    @property
    def active_camera_mode(self) -> dict:
        """Return active camera mode and latency-related settings."""
        return self._active_camera_mode

    def stop(self) -> None:
        """Stop the pipeline and worker."""
        self._running = False
        if self._pipeline:
            self._pipeline.stop()
        self._log.info("HailoRunner stopped")

    @property
    def is_running(self) -> bool:
        return self._running
