"""
Drawing utilities for annotated snapshots.

Draws bounding boxes and labels on frames for snapshot images.
"""

from typing import Sequence
import cv2
import numpy as np

from src.memory.object_memory import DetectionRecord


# Color palette for different labels (BGR)
_COLORS = [
    (0, 255, 0),    # green
    (255, 128, 0),   # orange
    (0, 128, 255),   # blue
    (255, 0, 128),   # magenta
    (0, 255, 255),   # cyan
    (128, 255, 0),   # lime
    (255, 0, 255),   # pink
    (255, 255, 0),   # yellow
]

_label_color_map: dict[str, tuple[int, int, int]] = {}
_color_index = 0


def _get_color(label: str) -> tuple[int, int, int]:
    """Assign a consistent color per label."""
    global _color_index
    if label not in _label_color_map:
        _label_color_map[label] = _COLORS[_color_index % len(_COLORS)]
        _color_index += 1
    return _label_color_map[label]


def draw_detections(
    frame: np.ndarray,
    detections: Sequence[DetectionRecord],
) -> np.ndarray:
    """Draw bounding boxes and labels on a copy of the frame.

    Bounding box coordinates in DetectionRecord are normalized [0,1].
    """
    annotated = frame.copy()
    h, w = annotated.shape[:2]

    for det in detections:
        color = _get_color(det.label)
        # Convert normalized bbox to pixel coords
        x1 = int(det.bbox_x * w)
        y1 = int(det.bbox_y * h)
        x2 = int((det.bbox_x + det.bbox_w) * w)
        y2 = int((det.bbox_y + det.bbox_h) * h)

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        text = f"{det.label} {det.confidence:.0%}"
        if det.track_id:
            text = f"[{det.track_id}] {text}"

        # Background for text
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(annotated, text, (x1 + 2, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    return annotated
