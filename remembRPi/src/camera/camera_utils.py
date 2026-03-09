"""
Camera utility functions.

Provides frame capture helpers for snapshot generation outside the
GStreamer pipeline (e.g., on-demand snapshots via OpenCV).
"""

import cv2
import numpy as np

from src.camera.camera_settings import (
    CameraSettings,
    fourcc_from_pixel_format,
    load_camera_settings,
    resolve_camera_mode,
)
from src.utils.logging_utils import get_logger


def capture_single_frame(
    device: str,
    width: int = 640,
    height: int = 480,
    camera_settings: CameraSettings | None = None,
) -> np.ndarray | None:
    """Capture a single frame from a USB camera using OpenCV.

    Used as a fallback for on-demand snapshots when the GStreamer pipeline's
    current frame buffer is not available.

    Returns:
        BGR numpy array, or None on failure.
    """
    log = get_logger()
    settings = camera_settings or load_camera_settings({"width": width, "height": height})
    mode = resolve_camera_mode(device, settings)

    try:
        cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*fourcc_from_pixel_format(mode.pixel_format)))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, mode.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, mode.height)
        cap.set(cv2.CAP_PROP_FPS, mode.frame_rate)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, settings.buffer_size)
        if not cap.isOpened():
            log.error("Could not open camera %s for single frame capture", device)
            return None

        # Drain queued frames so snapshot callers get the freshest frame available.
        for _ in range(settings.warmup_grabs):
            cap.grab()

        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            log.error("Failed to read frame from %s", device)
            return None
        return frame
    except Exception as e:
        log.error("Error capturing frame from %s: %s", device, e)
        return None
