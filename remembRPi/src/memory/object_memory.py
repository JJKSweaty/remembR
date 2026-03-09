"""
Object memory manager for remembR.

Maintains a bounded history of detected objects, merging repeated detections
across frames into stable object records. Each object is tracked by label
(and optionally by track_id for instance-level tracking when available).

Design:
- Ingests batches of DetectionRecords from the memory worker.
- Merges concurrent detections of the same label within a frame.
- Keeps per-object history (bounded) with timestamps, regions, and confidence.
- Provides query methods for current objects, recent objects, and search.
- Thread-safe for concurrent reads from the API layer and writes from the worker.

Inspired by SecondSight's TemporalDebouncer and FilterPipeline but extended
with persistent history and region tracking.
"""

import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from src.utils.logging_utils import get_logger
from src.utils.time_utils import now_utc, now_iso


@dataclass
class DetectionRecord:
    """A single detection from one frame."""
    label: str
    confidence: float
    bbox_x: float  # normalized [0,1]
    bbox_y: float
    bbox_w: float
    bbox_h: float
    track_id: int | None = None
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "bbox": {
                "x": round(self.bbox_x, 4),
                "y": round(self.bbox_y, 4),
                "w": round(self.bbox_w, 4),
                "h": round(self.bbox_h, 4),
            },
            "track_id": self.track_id,
            "timestamp": self.timestamp,
        }


@dataclass
class Sighting:
    """One sighting of an object in a particular region."""
    timestamp: float
    confidence: float
    region: str
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    track_id: int | None = None


@dataclass
class ObjectRecord:
    """Persistent record for a tracked object label.

    Note: This tracks object classes, not unique instances. A "cup" record
    represents any cup seen, not a specific cup. Track IDs help with
    short-term instance continuity but are not guaranteed across sessions.
    """
    label: str
    first_seen: float
    last_seen: float
    total_seen_count: int = 0
    best_confidence: float = 0.0
    latest_confidence: float = 0.0
    latest_region: str = "unknown"
    latest_bbox: dict = field(default_factory=dict)
    latest_track_id: int | None = None
    # Bounded history of recent sightings
    history: list[Sighting] = field(default_factory=list)
    # Debounce window: recent frame-level detection flags
    _recent_flags: list[bool] = field(default_factory=list)
    # Debounce parameters (set by ObjectMemoryManager after creation)
    _debounce_window: int = 5
    _debounce_min_hits: int = 3

    @property
    def is_debounce_confirmed(self) -> bool:
        """Check if this object passes temporal debounce (stable detection).

        Following the Hailo hailo-rpi5-examples pattern, an object must be
        detected in at least _debounce_min_hits of the last _debounce_window
        frames to be considered a real detection (not a false positive).
        """
        hits = sum(self._recent_flags[-self._debounce_window:])
        return hits >= self._debounce_min_hits

    @property
    def visible_now(self) -> bool:
        """Object is 'visible' if seen within the last 5 seconds AND debounce-confirmed.

        Debounce prevents false positives: a single misidentified frame
        cannot mark an object as visible.  This follows the Hailo
        hailo-rpi5-examples pattern where an object must be detected in
        N consecutive frames before being considered present.
        """
        if (time.time() - self.last_seen) >= 5.0:
            return False
        # Must have enough recent True flags to pass debounce
        return self.is_debounce_confirmed

    @property
    def seen_recently(self) -> bool:
        """Object was seen in the last 5 minutes."""
        return (time.time() - self.last_seen) < 300.0

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "last_seen_iso": datetime.fromtimestamp(
                self.last_seen, tz=timezone.utc
            ).isoformat(),
            "total_seen_count": self.total_seen_count,
            "best_confidence": round(self.best_confidence, 3),
            "latest_confidence": round(self.latest_confidence, 3),
            "latest_region": self.latest_region,
            "latest_bbox": self.latest_bbox,
            "latest_track_id": self.latest_track_id,
            "visible_now": self.visible_now,
            "seen_recently": self.seen_recently,
        }

    def to_persist_dict(self) -> dict:
        """Serializable dict for disk persistence."""
        d = self.to_dict()
        d["history"] = [
            {
                "timestamp": s.timestamp,
                "confidence": round(s.confidence, 3),
                "region": s.region,
                "bbox_x": round(s.bbox_x, 4),
                "bbox_y": round(s.bbox_y, 4),
                "bbox_w": round(s.bbox_w, 4),
                "bbox_h": round(s.bbox_h, 4),
                "track_id": s.track_id,
            }
            for s in self.history
        ]
        return d


class ObjectMemoryManager:
    """Thread-safe manager for object detection memory.

    Ingests detection batches from the memory worker and maintains
    a bounded, queryable store of object records.
    """

    def __init__(
        self,
        region_mapper=None,
        max_objects: int = 500,
        max_history_per_object: int = 50,
        debounce_window: int = 5,
        debounce_min_hits: int = 3,
        confidence_threshold: float = 0.45,
        label_thresholds: dict[str, float] | None = None,
        allowed_labels: set[str] | None = None,
        min_bbox_area_ratio: float = 0.015,
        stale_threshold_seconds: float = 300.0,
    ):
        self._lock = threading.RLock()
        self._objects: dict[str, ObjectRecord] = {}
        self._region_mapper = region_mapper
        self._max_objects = max_objects
        self._max_history = max_history_per_object
        self._debounce_window = debounce_window
        self._debounce_min_hits = debounce_min_hits
        self._confidence_threshold = confidence_threshold
        self._label_thresholds = label_thresholds or {}
        self._allowed_labels = allowed_labels
        self._min_bbox_area_ratio = min_bbox_area_ratio
        self._stale_threshold = stale_threshold_seconds
        self._log = get_logger()

    def ingest_detections(self, detections: list[DetectionRecord]) -> None:
        """Process a batch of detections from one frame.

        Applies filtering (allowlist, confidence, bbox size), updates
        existing records or creates new ones, and appends to history.
        """
        filtered = self._filter_detections(detections)

        with self._lock:
            # Track which labels were seen this frame (for debounce)
            seen_labels: set[str] = set()

            for det in filtered:
                seen_labels.add(det.label)
                self._update_object(det)

            # Update debounce flags for all tracked objects
            for label, obj in self._objects.items():
                was_seen = label in seen_labels
                obj._recent_flags.append(was_seen)
                if len(obj._recent_flags) > self._debounce_window:
                    obj._recent_flags = obj._recent_flags[-self._debounce_window:]

            # Evict oldest objects if over capacity
            self._evict_if_needed()

    def _filter_detections(self, detections: list[DetectionRecord]) -> list[DetectionRecord]:
        """Apply allowlist, confidence, and bbox size filters."""
        result = []
        for det in detections:
            # Allowlist filter
            if self._allowed_labels and det.label not in self._allowed_labels:
                continue
            # Per-label or default confidence threshold
            threshold = self._label_thresholds.get(det.label, self._confidence_threshold)
            if det.confidence < threshold:
                continue
            # Bbox size filter
            area = det.bbox_w * det.bbox_h
            if area < self._min_bbox_area_ratio:
                continue
            result.append(det)
        return result

    def _update_object(self, det: DetectionRecord) -> None:
        """Update or create an ObjectRecord for a detection."""
        label = det.label
        region = "unknown"
        if self._region_mapper:
            region = self._region_mapper.get_region(
                det.bbox_x, det.bbox_y, det.bbox_w, det.bbox_h,
            )

        if label in self._objects:
            obj = self._objects[label]
            obj.last_seen = det.timestamp
            obj.total_seen_count += 1
            obj.latest_confidence = det.confidence
            if det.confidence > obj.best_confidence:
                obj.best_confidence = det.confidence
            obj.latest_region = region
            obj.latest_bbox = {
                "x": det.bbox_x, "y": det.bbox_y,
                "w": det.bbox_w, "h": det.bbox_h,
            }
            if det.track_id is not None:
                obj.latest_track_id = det.track_id
        else:
            obj = ObjectRecord(
                label=label,
                first_seen=det.timestamp,
                last_seen=det.timestamp,
                total_seen_count=1,
                best_confidence=det.confidence,
                latest_confidence=det.confidence,
                latest_region=region,
                latest_bbox={
                    "x": det.bbox_x, "y": det.bbox_y,
                    "w": det.bbox_w, "h": det.bbox_h,
                },
                latest_track_id=det.track_id,
                _debounce_window=self._debounce_window,
                _debounce_min_hits=self._debounce_min_hits,
            )
            self._objects[label] = obj

        # Append to history (bounded)
        sighting = Sighting(
            timestamp=det.timestamp,
            confidence=det.confidence,
            region=region,
            bbox_x=det.bbox_x,
            bbox_y=det.bbox_y,
            bbox_w=det.bbox_w,
            bbox_h=det.bbox_h,
            track_id=det.track_id,
        )
        obj.history.append(sighting)
        if len(obj.history) > self._max_history:
            obj.history = obj.history[-self._max_history:]

    def _evict_if_needed(self) -> None:
        """Remove oldest/stalest objects if over max capacity."""
        if len(self._objects) <= self._max_objects:
            return
        # Sort by last_seen ascending (oldest first) and remove excess
        sorted_labels = sorted(
            self._objects.keys(),
            key=lambda l: self._objects[l].last_seen,
        )
        to_remove = len(self._objects) - self._max_objects
        for label in sorted_labels[:to_remove]:
            del self._objects[label]
            self._log.debug("Evicted stale object: %s", label)

    # ---- Query methods ----

    def get_all_objects(self) -> list[ObjectRecord]:
        """Return all tracked objects."""
        with self._lock:
            return list(self._objects.values())

    def get_current_objects(self) -> list[ObjectRecord]:
        """Return objects currently visible (seen within last 5s)."""
        with self._lock:
            return [o for o in self._objects.values() if o.visible_now]

    def get_recent_objects(self, within_seconds: float = 300.0) -> list[ObjectRecord]:
        """Return objects seen within the specified time window."""
        cutoff = time.time() - within_seconds
        with self._lock:
            return [
                o for o in self._objects.values()
                if o.last_seen >= cutoff
            ]

    def find_object(self, label: str) -> ObjectRecord | None:
        """Find a specific object by exact label."""
        with self._lock:
            return self._objects.get(label)

    def is_debounce_confirmed(self, label: str) -> bool:
        """Check if an object passes temporal debounce (stable detection)."""
        with self._lock:
            obj = self._objects.get(label)
            if obj is None:
                return False
            return obj.is_debounce_confirmed

    def get_state_for_persistence(self) -> dict:
        """Return serializable state for disk persistence."""
        with self._lock:
            return {
                "objects": {
                    label: obj.to_persist_dict()
                    for label, obj in self._objects.items()
                },
                "saved_at": now_iso(),
            }

    def load_state(self, state: dict) -> None:
        """Restore state from a persistence dict."""
        with self._lock:
            objects_data = state.get("objects", {})
            for label, obj_data in objects_data.items():
                history = []
                for h in obj_data.get("history", []):
                    history.append(Sighting(
                        timestamp=h["timestamp"],
                        confidence=h["confidence"],
                        region=h["region"],
                        bbox_x=h.get("bbox_x", 0),
                        bbox_y=h.get("bbox_y", 0),
                        bbox_w=h.get("bbox_w", 0),
                        bbox_h=h.get("bbox_h", 0),
                        track_id=h.get("track_id"),
                    ))
                self._objects[label] = ObjectRecord(
                    label=label,
                    first_seen=obj_data.get("first_seen", 0),
                    last_seen=obj_data.get("last_seen", 0),
                    total_seen_count=obj_data.get("total_seen_count", 0),
                    best_confidence=obj_data.get("best_confidence", 0),
                    latest_confidence=obj_data.get("latest_confidence", 0),
                    latest_region=obj_data.get("latest_region", "unknown"),
                    latest_bbox=obj_data.get("latest_bbox", {}),
                    latest_track_id=obj_data.get("latest_track_id"),
                    history=history,
                    _debounce_window=self._debounce_window,
                    _debounce_min_hits=self._debounce_min_hits,
                )
            self._log.info("Loaded %d objects from persistence", len(self._objects))
