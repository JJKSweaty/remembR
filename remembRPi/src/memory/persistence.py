"""
Persistence layer for remembR object memory.

Periodically saves the ObjectMemoryManager state to disk (JSON) so the
app can survive restarts without losing recently-seen object data.

Design:
- Uses a background thread with a configurable interval.
- Debounces writes to avoid expensive disk IO every frame.
- Loads state on startup if a store file exists.
"""

import json
import threading
import time
from pathlib import Path

from src.memory.object_memory import ObjectMemoryManager
from src.utils.logging_utils import get_logger


class MemoryPersistence:
    """Periodically persists ObjectMemoryManager state to a JSON file."""

    def __init__(
        self,
        memory: ObjectMemoryManager,
        store_path: str = "data/memory_store.json",
        interval_seconds: float = 30.0,
    ):
        self._memory = memory
        self._store_path = Path(store_path)
        self._interval = interval_seconds
        self._thread: threading.Thread | None = None
        self._running = False
        self._log = get_logger()

    def start(self) -> None:
        """Start the periodic persistence thread."""
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        self._running = True
        self._thread = threading.Thread(
            target=self._persist_loop, daemon=True, name="remembr-persistence",
        )
        self._thread.start()
        self._log.info("Persistence started: saving to %s every %ds",
                       self._store_path, self._interval)

    def _persist_loop(self) -> None:
        """Background loop that periodically writes state to disk."""
        while self._running:
            time.sleep(self._interval)
            self.save()

    def save(self) -> None:
        """Write current memory state to disk."""
        try:
            state = self._memory.get_state_for_persistence()
            # Atomic write: write to temp file then rename
            tmp_path = self._store_path.with_suffix(".tmp")
            with open(tmp_path, "w") as f:
                json.dump(state, f, indent=2, default=str)
            tmp_path.rename(self._store_path)
            self._log.debug("Persisted %d objects to %s",
                           len(state.get("objects", {})), self._store_path)
        except Exception as e:
            self._log.error("Failed to persist memory: %s", e)

    def load(self) -> bool:
        """Load previously saved state from disk.

        Returns:
            True if state was loaded successfully.
        """
        if not self._store_path.exists():
            self._log.info("No previous memory store found at %s", self._store_path)
            return False
        try:
            with open(self._store_path) as f:
                state = json.load(f)
            self._memory.load_state(state)
            self._log.info("Loaded memory from %s (saved at %s)",
                           self._store_path, state.get("saved_at", "unknown"))
            return True
        except Exception as e:
            self._log.error("Failed to load memory store: %s", e)
            return False

    def stop(self) -> None:
        """Stop the persistence thread and do a final save."""
        self._running = False
        self.save()
        self._log.info("Persistence stopped (final save complete)")
