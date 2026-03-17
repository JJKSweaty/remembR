"""
Barcode scanner input service.

Reads barcode data from a USB HID barcode scanner. Most USB barcode scanners
present as keyboard devices and send scanned data as keystrokes terminated
by Enter.

Supports two modes:
1. evdev mode (Linux): reads raw input events from /dev/input/eventX
2. stdin mode (fallback): reads from a dedicated stdin-like pipe

For the hackathon MVP, we also accept barcodes submitted via HTTP/WebSocket
from the phone app (manual entry or phone camera scan).
"""

import asyncio
import threading
import time
from pathlib import Path
from typing import Callable

from src.utils.logging_utils import get_logger


class BarcodeService:
    """Listens for barcode scanner input and dispatches scanned codes."""

    def __init__(
        self,
        device_path: str | None = None,
        on_scan: Callable[[str], None] | None = None,
    ):
        self._device_path = device_path
        self._on_scan = on_scan
        self._log = get_logger()
        self._running = False
        self._thread: threading.Thread | None = None
        self._last_barcode: str | None = None
        self._last_scan_time: float | None = None
        self._available = False

    @property
    def available(self) -> bool:
        return self._available

    @property
    def last_barcode(self) -> str | None:
        return self._last_barcode

    @property
    def last_scan_time(self) -> float | None:
        return self._last_scan_time

    def start(self) -> bool:
        """Start listening for barcode input.

        Returns True if the scanner device was found and listener started.
        Returns False if no scanner device is available (service runs in
        API-only mode where barcodes are submitted via HTTP/WebSocket).
        """
        if self._device_path:
            device = Path(self._device_path)
            if not device.exists():
                self._log.warning(
                    "Barcode scanner device %s not found. "
                    "Barcodes can still be submitted via API.",
                    self._device_path,
                )
                return False
        else:
            # Auto-detect: look for USB barcode scanner in /dev/input/
            self._device_path = self._find_barcode_scanner()
            if not self._device_path:
                self._log.info(
                    "No USB barcode scanner detected. "
                    "Barcodes can be submitted via API."
                )
                return False

        self._running = True
        self._available = True
        self._thread = threading.Thread(
            target=self._read_loop, daemon=True, name="barcode-reader"
        )
        self._thread.start()
        self._log.info("Barcode scanner started on %s", self._device_path)
        return True

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)

    def submit_barcode(self, barcode: str) -> None:
        """Manually submit a barcode (from API or phone camera scan)."""
        barcode = barcode.strip()
        if not barcode:
            return
        self._last_barcode = barcode
        self._last_scan_time = time.time()
        self._log.info("Barcode submitted: %s", barcode)
        if self._on_scan:
            self._on_scan(barcode)

    def _find_barcode_scanner(self) -> str | None:
        """Try to find a USB barcode scanner via evdev."""
        try:
            import evdev
            devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
            for dev in devices:
                name_lower = dev.name.lower()
                if any(kw in name_lower for kw in ["barcode", "scanner", "hid"]):
                    self._log.info("Found barcode scanner: %s at %s", dev.name, dev.path)
                    return dev.path
        except ImportError:
            self._log.debug("evdev not available; barcode auto-detect disabled")
        except Exception as e:
            self._log.debug("Barcode scanner auto-detect failed: %s", e)
        return None

    def _read_loop(self) -> None:
        """Read barcode input from evdev device."""
        try:
            import evdev
            dev = evdev.InputDevice(self._device_path)
            self._log.info("Reading barcodes from %s (%s)", dev.name, dev.path)

            buffer = ""
            for event in dev.read_loop():
                if not self._running:
                    break
                if event.type == evdev.ecodes.EV_KEY and event.value == 1:
                    key = evdev.ecodes.KEY[event.code]
                    if key == "KEY_ENTER":
                        if buffer:
                            self.submit_barcode(buffer)
                            buffer = ""
                    elif key.startswith("KEY_") and len(key) == 5:
                        # Single character keys: KEY_A -> 'A', KEY_1 -> '1'
                        buffer += key[-1]
                    elif key in ("KEY_MINUS", "KEY_DASH"):
                        buffer += "-"
                    elif key == "KEY_SPACE":
                        buffer += " "
        except ImportError:
            self._log.error("evdev not installed; cannot read barcode scanner")
        except Exception as e:
            self._log.error("Barcode reader error: %s", e)
            self._available = False

    def to_status_dict(self) -> dict:
        return {
            "available": self._available,
            "device": self._device_path,
            "last_barcode": self._last_barcode,
            "last_scan_time": self._last_scan_time,
        }
