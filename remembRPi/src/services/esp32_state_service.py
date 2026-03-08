"""
ESP32 companion state service.

Sends state updates to the ESP32 to control companion LED patterns
and optional buzzer cues. Communicates over HTTP to the same ESP32
that runs the pan-tilt controller.

LED states:
  idle       - gentle breathing/pulse
  searching  - scanning pattern
  found      - brief success flash
  alert      - attention-getting pattern (med mismatch, etc.)
  error      - red steady
"""

import httpx

from src.utils.logging_utils import get_logger


# Valid companion states
VALID_STATES = {"idle", "searching", "found", "alert", "error"}


class ESP32StateService:
    """Sends companion state updates to the ESP32."""

    def __init__(
        self,
        esp32_host: str = "192.168.1.135",
        esp32_port: int = 8080,
    ):
        self._base_url = f"http://{esp32_host}:{esp32_port}"
        self._log = get_logger()
        self._current_state = "idle"
        self._available = False

    @property
    def current_state(self) -> str:
        return self._current_state

    @property
    def available(self) -> bool:
        return self._available

    def set_available(self, available: bool) -> None:
        """Set availability (shared with pan-tilt connection check)."""
        self._available = available

    async def set_state(self, state: str) -> dict:
        """Send a state update to the ESP32.

        For the MVP, this posts to /command on the ESP32. The ESP32 firmware
        would need a /state endpoint added to handle LED patterns. Until then,
        we track state locally and log it.
        """
        if state not in VALID_STATES:
            return {"status": "error", "message": f"Invalid state: {state}"}

        self._current_state = state
        self._log.info("Companion state -> %s", state)

        if not self._available:
            return {"status": "ok", "state": state, "sent": False}

        # Future: POST to ESP32 /state endpoint
        # For now, state is tracked locally and available via API
        return {"status": "ok", "state": state, "sent": False}

    def to_status_dict(self) -> dict:
        return {
            "available": self._available,
            "current_state": self._current_state,
        }
