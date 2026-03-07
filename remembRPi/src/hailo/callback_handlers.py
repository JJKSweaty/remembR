"""
Hailo detection callback handlers.

Extracts detection metadata from GStreamer buffer in the Hailo pipeline callback.
Following the hailo-rpi5-examples pattern: the callback must stay lightweight.
Heavy processing is handed off via a thread-safe queue.

Reference: hailo-rpi5-examples/basic_pipelines/detection.py
"""

import time
import queue
from dataclasses import dataclass, field

from src.utils.logging_utils import get_logger

# These imports are resolved at runtime inside the Hailo venv
# They are guarded to allow the rest of the project to import without Hailo deps
try:
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import Gst
    import hailo
    from hailo_apps.hailo_app_python.core.common.buffer_utils import (
        get_caps_from_pad,
        get_numpy_from_buffer,
    )
    from hailo_apps.hailo_app_python.core.gstreamer.gstreamer_app import app_callback_class
    HAILO_AVAILABLE = True
except ImportError:
    HAILO_AVAILABLE = False
    # Stubs so the module can be imported outside the Hailo venv
    app_callback_class = object
    Gst = None


@dataclass
class RawDetection:
    """A single detection extracted from the Hailo pipeline callback.

    Bounding box coords are normalized [0, 1] relative to frame dimensions.
    """
    label: str
    confidence: float
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    track_id: int | None = None
    timestamp: float = field(default_factory=time.time)


class RemembRCallbackData(app_callback_class if HAILO_AVAILABLE else object):
    """Callback user_data that collects detections and optionally captures frames.

    Inherits from hailo_apps app_callback_class which provides:
    - frame_count, use_frame, frame_queue, running
    - increment(), get_count(), set_frame(), get_frame()

    Adds a thread-safe detection queue for the memory worker to consume.
    """

    def __init__(self, detection_queue: queue.Queue, frame_holder: dict):
        if HAILO_AVAILABLE:
            super().__init__()
        self._detection_queue = detection_queue
        self._frame_holder = frame_holder
        self._log = get_logger()
        self._frame_count = 0

    @property
    def detection_queue(self) -> queue.Queue:
        return self._detection_queue

    def get_frame_count(self) -> int:
        return self._frame_count

    def increment_count(self) -> int:
        self._frame_count += 1
        return self._frame_count


def app_callback(pad, info, user_data: RemembRCallbackData):
    """GStreamer pad probe callback for the Hailo detection pipeline.

    This runs on every frame. It must stay fast and non-blocking.
    Extracts detections and pushes them to a queue for async processing.

    Pattern follows hailo-rpi5-examples/basic_pipelines/detection.py:
    - Get buffer from info
    - Get ROI from buffer
    - Iterate HAILO_DETECTION objects
    - Extract label, confidence, bbox, track_id

    Heavy work (memory updates, snapshots, WebSocket messages) happens
    in a separate consumer thread.
    """
    buffer = info.get_buffer()
    if buffer is None:
        return Gst.PadProbeReturn.OK

    frame_num = user_data.increment_count()
    if HAILO_AVAILABLE and hasattr(user_data, 'increment'):
        user_data.increment()

    now = time.time()
    raw_detections: list[RawDetection] = []

    # Extract frame if use_frame is set (for snapshots)
    frame = None
    if HAILO_AVAILABLE:
        format_str, width, height = get_caps_from_pad(pad)
        if (user_data.use_frame and format_str is not None
                and width is not None and height is not None):
            frame = get_numpy_from_buffer(buffer, format_str, width, height)

    # Extract detections from Hailo metadata
    roi = hailo.get_roi_from_buffer(buffer)
    detections = roi.get_objects_typed(hailo.HAILO_DETECTION)

    for detection in detections:
        label = detection.get_label()
        confidence = detection.get_confidence()
        bbox = detection.get_bbox()

        # Extract tracker ID if available (from hailotracker element)
        track_id = None
        tracks = detection.get_objects_typed(hailo.HAILO_UNIQUE_ID)
        if tracks:
            track_id = tracks[0].get_id()

        raw_detections.append(RawDetection(
            label=label,
            confidence=confidence,
            bbox_x=bbox.xmin(),
            bbox_y=bbox.ymin(),
            bbox_w=bbox.width(),
            bbox_h=bbox.height(),
            track_id=track_id,
            timestamp=now,
        ))

    # Push detections to queue (non-blocking). If queue is full, drop oldest.
    if raw_detections:
        try:
            user_data.detection_queue.put_nowait((raw_detections, frame))
        except queue.Full:
            # Drop oldest to make room - detection freshness matters more than completeness
            try:
                user_data.detection_queue.get_nowait()
            except queue.Empty:
                pass
            try:
                user_data.detection_queue.put_nowait((raw_detections, frame))
            except queue.Full:
                pass
    elif frame is not None:
        # Even with no detections, store the latest frame for snapshots
        user_data._frame_holder["latest_frame"] = frame

    # Log periodic summary (every 100 frames to avoid spam)
    if frame_num % 100 == 0:
        user_data._log.debug(
            "Frame %d: %d detections, queue size: %d",
            frame_num, len(raw_detections), user_data.detection_queue.qsize(),
        )

    return Gst.PadProbeReturn.OK
