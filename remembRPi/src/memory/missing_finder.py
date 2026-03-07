"""
Missing object finder for remembR.

Searches object memory for a requested item, handling:
- Label alias resolution (e.g., "phone" -> "cell phone")
- Current visibility check
- Historical memory search
- Response generation with human-readable descriptions

Inspired by SecondSight's search flow where the phone app sends a query
and the backend returns the best match with location and timestamp context.

Honest limitation: COCO object detection identifies object classes, not
unique instances. If you ask "where is my wallet?", the system can tell
you where a detected "handbag" was last seen, but it cannot distinguish
YOUR wallet from any other wallet-like object.
"""

import time
import yaml
from pathlib import Path

from src.memory.object_memory import ObjectMemoryManager, ObjectRecord
from src.utils.logging_utils import get_logger
from src.utils.time_utils import format_age
from datetime import datetime, timezone


# Default label aliases; extended from labels.yaml config
DEFAULT_ALIASES: dict[str, str] = {
    "phone": "cell phone",
    "cellphone": "cell phone",
    "mobile": "cell phone",
    "smartphone": "cell phone",
    "bag": "backpack",
    "purse": "handbag",
    "wallet": "handbag",
    "mug": "cup",
    "glass": "cup",
    "controller": "remote",
    "tv remote": "remote",
    "monitor": "tv",
    "screen": "tv",
}


class MissingFinder:
    """Searches object memory for missing items requested by the phone app."""

    def __init__(
        self,
        memory: ObjectMemoryManager,
        aliases: dict[str, str] | None = None,
    ):
        self._memory = memory
        self._aliases = aliases or DEFAULT_ALIASES
        self._log = get_logger()

    @classmethod
    def from_config(cls, memory: ObjectMemoryManager, config_path: str = "config/labels.yaml") -> "MissingFinder":
        """Create MissingFinder with aliases loaded from labels.yaml."""
        aliases = dict(DEFAULT_ALIASES)
        path = Path(config_path)
        if path.exists():
            try:
                with open(path) as f:
                    data = yaml.safe_load(f)
                if data and "aliases" in data:
                    aliases.update(data["aliases"])
            except Exception as e:
                get_logger().warning("Could not load label aliases from %s: %s", path, e)
        return cls(memory=memory, aliases=aliases)

    def resolve_label(self, query: str) -> str:
        """Resolve a user query to a COCO detection label.

        Tries the query as-is first, then checks aliases.
        Case-insensitive matching.
        """
        query_lower = query.strip().lower()

        # Direct match check
        obj = self._memory.find_object(query_lower)
        if obj is not None:
            return query_lower

        # Alias resolution
        resolved = self._aliases.get(query_lower)
        if resolved:
            self._log.debug("Resolved alias '%s' -> '%s'", query_lower, resolved)
            return resolved

        return query_lower

    def find(self, query: str, snapshot_url: str | None = None) -> dict:
        """Search for a missing object.

        Args:
            query: Object name from user (e.g., "wallet", "phone", "keys").
            snapshot_url: Optional URL of a snapshot to include in the response.

        Returns:
            Dict with find result containing label, found status, location,
            timestamp, confidence, and a human-readable message.
        """
        label = self.resolve_label(query)
        self._log.info("Searching for '%s' (resolved: '%s')", query, label)

        obj = self._memory.find_object(label)

        if obj is None:
            return self._not_found_response(query, label)

        if obj.visible_now:
            return self._found_now_response(query, label, obj, snapshot_url)

        if obj.seen_recently:
            return self._found_recently_response(query, label, obj, snapshot_url)

        return self._found_stale_response(query, label, obj, snapshot_url)

    def _not_found_response(self, query: str, label: str) -> dict:
        """No record at all for this object."""
        message = f"I haven't seen {query}"
        if label != query.strip().lower():
            message += f" (looking for '{label}')"
        message += " in my memory. It may not have been in view of the camera."

        return {
            "type": "find_result",
            "label": label,
            "query": query,
            "found_now": False,
            "last_seen": None,
            "last_seen_iso": None,
            "last_seen_ago": None,
            "region": None,
            "confidence": None,
            "track_id": None,
            "snapshot_url": None,
            "message": message,
        }

    def _found_now_response(
        self, query: str, label: str, obj: ObjectRecord, snapshot_url: str | None,
    ) -> dict:
        """Object is currently visible in the camera feed."""
        age_str = format_age(datetime.fromtimestamp(obj.last_seen, tz=timezone.utc))
        message = (
            f"{query.capitalize()} is visible right now in the {obj.latest_region}. "
            f"Detected with {obj.latest_confidence:.0%} confidence."
        )

        return {
            "type": "find_result",
            "label": label,
            "query": query,
            "found_now": True,
            "last_seen": obj.last_seen,
            "last_seen_iso": datetime.fromtimestamp(
                obj.last_seen, tz=timezone.utc
            ).isoformat(),
            "last_seen_ago": age_str,
            "region": obj.latest_region,
            "confidence": round(obj.latest_confidence, 3),
            "track_id": obj.latest_track_id,
            "snapshot_url": snapshot_url,
            "message": message,
        }

    def _found_recently_response(
        self, query: str, label: str, obj: ObjectRecord, snapshot_url: str | None,
    ) -> dict:
        """Object was seen recently but is not currently visible."""
        age_str = format_age(datetime.fromtimestamp(obj.last_seen, tz=timezone.utc))
        message = (
            f"I last saw {query} {age_str} in the {obj.latest_region}. "
            f"It's not visible right now, but was detected with "
            f"{obj.best_confidence:.0%} confidence."
        )

        return {
            "type": "find_result",
            "label": label,
            "query": query,
            "found_now": False,
            "last_seen": obj.last_seen,
            "last_seen_iso": datetime.fromtimestamp(
                obj.last_seen, tz=timezone.utc
            ).isoformat(),
            "last_seen_ago": age_str,
            "region": obj.latest_region,
            "confidence": round(obj.best_confidence, 3),
            "track_id": obj.latest_track_id,
            "snapshot_url": snapshot_url,
            "message": message,
        }

    def _found_stale_response(
        self, query: str, label: str, obj: ObjectRecord, snapshot_url: str | None,
    ) -> dict:
        """Object was seen a long time ago."""
        age_str = format_age(datetime.fromtimestamp(obj.last_seen, tz=timezone.utc))
        message = (
            f"I last saw {query} {age_str} in the {obj.latest_region}, "
            f"but that was a while ago. It may have been moved."
        )

        return {
            "type": "find_result",
            "label": label,
            "query": query,
            "found_now": False,
            "last_seen": obj.last_seen,
            "last_seen_iso": datetime.fromtimestamp(
                obj.last_seen, tz=timezone.utc
            ).isoformat(),
            "last_seen_ago": age_str,
            "region": obj.latest_region,
            "confidence": round(obj.best_confidence, 3),
            "track_id": obj.latest_track_id,
            "snapshot_url": snapshot_url,
            "message": message,
        }
