"""
Barcode scanner input service.

Reads barcode data from:
1. USB HID barcode scanner (evdev keyboard events)
2. Camera-based scanning via OpenCV + pyzbar (with bounding boxes)
3. HTTP/WebSocket submission from the phone app

Camera mode uses multiple image preprocessing strategies (sharpening,
CLAHE, adaptive threshold, upscaling) to handle poor focus conditions.
"""

import asyncio
import threading
import time
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from src.utils.logging_utils import get_logger

try:
    from pyzbar import pyzbar as _pyzbar
    HAS_PYZBAR = True
except ImportError:
    HAS_PYZBAR = False

try:
    _test_det = cv2.barcode.BarcodeDetector()
    HAS_CV_BARCODE = True
except AttributeError:
    HAS_CV_BARCODE = False


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

    # ── Camera-based barcode scanning ───────────────────────

    @staticmethod
    def preprocess_for_barcodes(frame: np.ndarray) -> list[np.ndarray]:
        """Return preprocessed grayscale images to help decode blurry barcodes."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        images = [gray]

        # Sharpen
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
        sharpened = cv2.filter2D(gray, -1, kernel)
        images.append(sharpened)

        # CLAHE
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        images.append(clahe.apply(gray))

        # Adaptive threshold
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
        )
        images.append(thresh)

        # 2x upscale of sharpened (helps with small / blurry barcodes)
        h, w = sharpened.shape[:2]
        images.append(cv2.resize(sharpened, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC))

        return images

    def scan_frame(self, frame: np.ndarray, draw: bool = True) -> list[dict]:
        """Scan a BGR frame for barcodes/QR codes.

        Args:
            frame: BGR numpy array (modified in-place if draw=True).
            draw: If True, draw bounding boxes and labels on the frame.

        Returns:
            List of dicts with keys: type, data, polygon.
        """
        preprocessed = self.preprocess_for_barcodes(frame)
        results: list[dict] = []
        seen: set[str] = set()

        # pyzbar (best coverage: QR, EAN, UPC, Code128, Code39, etc.)
        if HAS_PYZBAR:
            sources = [frame] + preprocessed
            for img in sources:
                for obj in _pyzbar.decode(img):
                    data_str = obj.data.decode("utf-8", errors="replace")
                    key = f"{obj.type}:{data_str}"
                    if key in seen:
                        continue
                    seen.add(key)

                    pts = np.array([(p.x, p.y) for p in obj.polygon], dtype=np.int32)
                    entry = {"type": obj.type, "data": data_str, "polygon": pts}
                    results.append(entry)

                    if draw:
                        color = self._color_for_type(obj.type)
                        if len(pts) >= 4:
                            cv2.polylines(frame, [pts], True, color, 2)
                        else:
                            r = obj.rect
                            cv2.rectangle(frame, (r.left, r.top),
                                          (r.left + r.width, r.top + r.height), color, 2)
                        label = f"{obj.type}: {data_str}"
                        tx = int(pts[0][0]) if len(pts) else obj.rect.left
                        ty = max(int(pts[0][1]) - 10 if len(pts) else obj.rect.top - 10, 15)
                        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                        cv2.rectangle(frame, (tx, ty - th - 4), (tx + tw + 4, ty + 4), color, -1)
                        cv2.putText(frame, label, (tx + 2, ty),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

                    # Also submit through the normal pipeline
                    self.submit_barcode(data_str)

        # OpenCV BarcodeDetector fallback
        if HAS_CV_BARCODE:
            detector = cv2.barcode.BarcodeDetector()
            result = detector.detectAndDecode(frame)
            if len(result) == 4:
                ok, decoded_info, decoded_type, points = result
                _cv_ok = ok and decoded_info is not None
            else:
                decoded_info, decoded_type, points = result
                _cv_ok = bool(decoded_info)
            if _cv_ok:
                for i, info in enumerate(decoded_info):
                    if not info:
                        continue
                    btype = str(decoded_type[i]) if decoded_type is not None and i < len(decoded_type) else "BARCODE"
                    key = f"{btype}:{info}"
                    if key in seen:
                        continue
                    seen.add(key)

                    pts = points[i].astype(np.int32) if points is not None else np.array([])
                    results.append({"type": btype, "data": info, "polygon": pts})
                    if draw and len(pts):
                        color = self._color_for_type(btype)
                        cv2.polylines(frame, [pts], True, color, 2)
                        label = f"{btype}: {info}"
                        tx, ty = int(pts[0][0]), max(int(pts[0][1]) - 10, 15)
                        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                        cv2.rectangle(frame, (tx, ty - th - 4), (tx + tw + 4, ty + 4), color, -1)
                        cv2.putText(frame, label, (tx + 2, ty),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
                    self.submit_barcode(info)

        return results

    @staticmethod
    def _color_for_type(barcode_type: str) -> tuple[int, int, int]:
        COLORS = {
            "QRCODE": (0, 255, 0), "EAN13": (255, 165, 0), "EAN8": (255, 165, 0),
            "UPCA": (255, 165, 0), "UPCE": (255, 165, 0), "CODE128": (0, 200, 255),
            "CODE39": (0, 200, 255), "I25": (200, 200, 0), "PDF417": (128, 0, 255),
        }
        return COLORS.get(barcode_type.upper(), (0, 255, 255))
