"""
Region mapper for remembR.

Converts normalized bounding box coordinates into human-readable
scene region descriptions using a simple grid-based heuristic.

Design decision: A 3x3 grid is simple and sufficient for describing
where household objects are relative to the camera's view. No depth
estimation or 3D mapping needed - just "left side", "center area", etc.
"""

import yaml
from pathlib import Path

from src.utils.logging_utils import get_logger


# Default 3x3 region labels
DEFAULT_REGION_LABELS = {
    "top_left": "upper-left area",
    "top_center": "upper-center area",
    "top_right": "upper-right area",
    "middle_left": "left side",
    "middle_center": "center area",
    "middle_right": "right side",
    "bottom_left": "lower-left area",
    "bottom_center": "lower-center area",
    "bottom_right": "lower-right area",
}


class RegionMapper:
    """Maps normalized bounding box center to a human-readable region.

    Divides the frame into a grid (default 3x3) and returns a descriptive
    label for the cell containing the bbox center.
    """

    def __init__(
        self,
        columns: int = 3,
        rows: int = 3,
        labels: dict[str, str] | None = None,
    ):
        self._columns = columns
        self._rows = rows
        self._labels = labels or DEFAULT_REGION_LABELS
        self._log = get_logger()

    @classmethod
    def from_config(cls, config: dict) -> "RegionMapper":
        """Create RegionMapper from the regions section of app_config.yaml."""
        return cls(
            columns=config.get("columns", 3),
            rows=config.get("rows", 3),
            labels=config.get("labels", DEFAULT_REGION_LABELS),
        )

    def get_region(
        self, bbox_x: float, bbox_y: float, bbox_w: float, bbox_h: float,
    ) -> str:
        """Determine the region for a bounding box.

        Uses the center point of the bbox to determine which grid cell
        it falls into.

        Args:
            bbox_x, bbox_y: Top-left corner (normalized 0-1).
            bbox_w, bbox_h: Width and height (normalized 0-1).

        Returns:
            Human-readable region description.
        """
        # Center point of the bounding box
        cx = bbox_x + bbox_w / 2.0
        cy = bbox_y + bbox_h / 2.0

        # Clamp to [0, 1)
        cx = max(0.0, min(cx, 0.999))
        cy = max(0.0, min(cy, 0.999))

        # Determine grid cell
        col = int(cx * self._columns)
        row = int(cy * self._rows)

        # Map to label key
        row_names = ["top", "middle", "bottom"]
        col_names = ["left", "center", "right"]

        if row < len(row_names) and col < len(col_names):
            key = f"{row_names[row]}_{col_names[col]}"
            return self._labels.get(key, f"zone ({row},{col})")

        return "unknown"

    def describe_position(
        self, bbox_x: float, bbox_y: float, bbox_w: float, bbox_h: float,
    ) -> str:
        """Get a more detailed position description including relative size.

        Returns description like "center area (medium object)".
        """
        region = self.get_region(bbox_x, bbox_y, bbox_w, bbox_h)
        area = bbox_w * bbox_h

        if area > 0.15:
            size = "large object"
        elif area > 0.04:
            size = "medium object"
        else:
            size = "small object"

        return f"{region} ({size})"
