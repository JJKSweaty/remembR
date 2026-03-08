"""
Camera utility functions.

Provides frame capture helpers for snapshot generation outside the
GStreamer pipeline (e.g., on-demand snapshots via OpenCV).
"""

import cv2
import numpy as np

from src.utils.logging_utils import get_logger


def capture_single_frame(device: str, width: int = 1920, height: int = 1080) -> np.ndarray | None:
    """Capture a single frame from a USB camera using OpenCV.

    Used as a fallback for on-demand snapshots when the GStreamer pipeline's
    current frame buffer is not available.

    Returns:
        BGR numpy array, or None on failure.
    """
    log = get_logger()
    try:
        cap = cv2.VideoCapture(device)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        if not cap.isOpened():
            log.error("Could not open camera %s for single frame capture", device)
            return None
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            log.error("Failed to read frame from %s", device)
            return None
        return frame
    except Exception as e:
        log.error("Error capturing frame from %s: %s", device, e)
        return None
