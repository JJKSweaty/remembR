"""
Pan-tilt servo control service.

Sends HTTP commands to the ESP32-S3 pan-tilt controller to sweep the room,
center the camera, or move to a specific position.

The ESP32 exposes endpoints on port 8080:
  POST /sweep           - full room sweep
  POST /center          - center both servos
  POST /pan?us=<value>  - set pan position (520-2520 us)
  POST /tilt?us=<value> - set tilt position (200-1700 us)
  GET  /status          - device status JSON
"""

import asyncio
import time
from typing import Any

import httpx

from src.utils.logging_utils import get_logger


class PanTiltService:
    """Async HTTP client for the ESP32 pan-tilt controller."""

    def __init__(
        self,
        esp32_host: str = "192.168.1.135",
        esp32_port: int = 8080,
        timeout: float = 30.0,
    ):
        self._base_url = f"http://{esp32_host}:{esp32_port}"
        self._timeout = timeout
        self._log = get_logger()
        self._available = False
        self._sweeping = False
        self._last_sweep_time: float | None = None

    @property
    def available(self) -> bool:
        return self._available

    @property
    def sweeping(self) -> bool:
        return self._sweeping

    async def check_connection(self) -> bool:
        """Ping the ESP32 to verify it is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._base_url}/status")
                if resp.status_code == 200:
                    self._available = True
                    self._log.info("ESP32 pan-tilt controller reachable at %s", self._base_url)
                    return True
        except Exception as e:
            self._log.warning("ESP32 pan-tilt not reachable at %s: %s", self._base_url, e)
        self._available = False
        return False

    async def sweep(self) -> dict:
        """Execute a full room sweep.

        Returns:
            Dict with status and timing info.
        """
        if self._sweeping:
            return {"status": "busy", "message": "Sweep already in progress"}

        if not self._available:
            return {"status": "unavailable", "message": "Pan-tilt controller not connected"}

        self._sweeping = True
        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/sweep")
                elapsed = round(time.time() - start, 1)
                self._last_sweep_time = time.time()
                self._log.info("Sweep completed in %.1fs (HTTP %d)", elapsed, resp.status_code)
                return {
                    "status": "ok",
                    "message": "Sweep complete",
                    "duration_seconds": elapsed,
                }
        except httpx.TimeoutException:
            return {"status": "timeout", "message": "Sweep timed out"}
        except Exception as e:
            self._log.error("Sweep failed: %s", e)
            return {"status": "error", "message": str(e)}
        finally:
            self._sweeping = False

    async def center(self) -> dict:
        """Center both servos."""
        if not self._available:
            return {"status": "unavailable", "message": "Pan-tilt controller not connected"}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(f"{self._base_url}/center")
                return {"status": "ok", "message": "Centered"}
        except Exception as e:
            self._log.error("Center failed: %s", e)
            return {"status": "error", "message": str(e)}

    async def set_pan(self, us: int) -> dict:
        """Set pan servo position in microseconds (520-2520)."""
        if not self._available:
            return {"status": "unavailable"}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(f"{self._base_url}/pan", params={"us": us})
                return {"status": "ok", "pan_us": us}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def set_tilt(self, us: int) -> dict:
        """Set tilt servo position in microseconds (200-1700)."""
        if not self._available:
            return {"status": "unavailable"}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(f"{self._base_url}/tilt", params={"us": us})
                return {"status": "ok", "tilt_us": us}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def get_status(self) -> dict:
        """Get ESP32 device status."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._base_url}/status")
                return resp.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def to_status_dict(self) -> dict:
        """Return service status for health endpoint."""
        return {
            "available": self._available,
            "base_url": self._base_url,
            "sweeping": self._sweeping,
            "last_sweep_time": self._last_sweep_time,
        }
