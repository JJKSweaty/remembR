#!/usr/bin/env python3
"""
Standalone barcode/QR-code scanner using OpenCV + pyzbar.

Opens the USB camera directly (no run.sh needed), detects barcodes and QR codes
in real-time, draws bounding boxes + decoded text on the video feed, and prints
results to the console.

Performance design:
  - Barcode detection runs in a BACKGROUND THREAD so the display is never blocked.
  - Tiered preprocessing: fast path first (raw color), only applies heavier
    transforms when the fast path yields nothing.
  - Buffer size = 1 so we always display the freshest frame.

Focus workaround for fixed-focus cameras:
  - Locks exposure to a short shutter time (reduces motion blur at barcode distance).
  - Sets camera sharpness to maximum.
  - Shows a focus-distance hint in the HUD.

Usage:
    python3 scripts/test_barcode_camera.py               # auto-detect camera
    python3 scripts/test_barcode_camera.py --device 0    # specific /dev/videoN
    python3 scripts/test_barcode_camera.py --device /dev/video0
    python3 scripts/test_barcode_camera.py --exposure 150  # manual exposure value

Controls:
    q / ESC  -- quit
    s        -- save current frame to data/snapshots/
    p        -- toggle heavy preprocessing (sharpening/threshold)
    e / E    -- decrease / increase exposure (if manual exposure supported)
    i        -- print camera controls to terminal
"""

import argparse
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

# Add project root to path so we can optionally import project utilities
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

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

HAS_CV_QR = hasattr(cv2, "QRCodeDetector")


# -- Colour palette ----------------------------------------------------------

COLORS = {
    "QRCODE":     (0, 255, 0),
    "EAN13":      (255, 165, 0),
    "EAN8":       (255, 165, 0),
    "UPCA":       (255, 165, 0),
    "UPCE":       (255, 165, 0),
    "CODE128":    (0, 200, 255),
    "CODE39":     (0, 200, 255),
    "CODE93":     (0, 200, 255),
    "I25":        (200, 200, 0),
    "DATAMATRIX": (255, 0, 255),
    "PDF417":     (128, 0, 255),
    "DEFAULT":    (0, 255, 255),
}

def color_for_type(t: str) -> tuple:
    return COLORS.get(str(t).upper(), COLORS["DEFAULT"])


# -- Preprocessing -----------------------------------------------------------
# Each function is only called when cheaper passes above it found nothing.
# This keeps the background thread fast under normal conditions.

def _gray(frame):
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

def _sharpen(gray):
    k = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    return cv2.filter2D(gray, -1, k)

def _clahe(gray):
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)

def _adaptive_thresh(gray):
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )

def _upscale2x(gray):
    h, w = gray.shape[:2]
    return cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)


# -- Barcode detection (runs in background thread) ---------------------------

def _pyzbar_decode_images(images):
    seen = set()
    results = []
    for img in images:
        for obj in _pyzbar.decode(img):
            data = obj.data.decode("utf-8", errors="replace")
            key = f"{obj.type}:{data}"
            if key not in seen:
                seen.add(key)
                results.append(obj)
    return results


def detect_barcodes(frame, heavy_preprocess):
    """Try to decode barcodes from a BGR frame. Tiered: fast path first.

    Returns list of dicts: {type, data, polygon, rect}.
    """
    results = []
    seen = set()
    gray = _gray(frame)

    # -- Tier 1: fast -- raw colour + plain gray
    if HAS_PYZBAR:
        for obj in _pyzbar_decode_images([frame, gray]):
            data = obj.data.decode("utf-8", errors="replace")
            key = f"{obj.type}:{data}"
            if key not in seen:
                seen.add(key)
                pts = np.array([(p.x, p.y) for p in obj.polygon], dtype=np.int32)
                results.append({"type": obj.type, "data": data,
                                 "polygon": pts, "rect": obj.rect})

    if HAS_CV_BARCODE:
        det = cv2.barcode.BarcodeDetector()
        res = det.detectAndDecode(gray)
        info, btype, points = (res[1], res[2], res[3]) if len(res) == 4 else res
        if info:
            for i, d in enumerate(info):
                if not d:
                    continue
                t = str(btype[i]) if btype is not None and i < len(btype) else "BARCODE"
                key = f"{t}:{d}"
                if key not in seen:
                    seen.add(key)
                    pts = points[i].astype(np.int32) if points is not None else np.array([])
                    results.append({"type": t, "data": d, "polygon": pts, "rect": None})

    if HAS_CV_QR:
        qr_det = cv2.QRCodeDetector()
        qr_data, qr_pts, _ = qr_det.detectAndDecode(gray)
        if qr_data:
            key = f"QRCODE:{qr_data}"
            if key not in seen:
                seen.add(key)
                pts = qr_pts[0].astype(np.int32) if qr_pts is not None else np.array([])
                results.append({"type": "QRCODE", "data": qr_data,
                                 "polygon": pts, "rect": None})

    # -- Tier 2: heavy preprocessing -- only when fast path found nothing
    if not results and heavy_preprocess:
        sharpened = _sharpen(gray)
        enhanced  = _clahe(gray)
        thresh    = _adaptive_thresh(gray)
        upscaled  = _upscale2x(sharpened)

        if HAS_PYZBAR:
            for obj in _pyzbar_decode_images([sharpened, enhanced, thresh, upscaled]):
                data = obj.data.decode("utf-8", errors="replace")
                key = f"{obj.type}:{data}"
                if key not in seen:
                    seen.add(key)
                    # upscaled polygon coords need to be halved back to frame space
                    pts = np.array([(p.x // 2, p.y // 2) for p in obj.polygon],
                                   dtype=np.int32)
                    results.append({"type": obj.type, "data": data,
                                    "polygon": pts, "rect": obj.rect})

        if HAS_CV_BARCODE:
            det = cv2.barcode.BarcodeDetector()
            for img in (sharpened, enhanced, thresh):
                res = det.detectAndDecode(img)
                info, btype, points = (res[1], res[2], res[3]) if len(res) == 4 else res
                if not info:
                    continue
                for i, d in enumerate(info):
                    if not d:
                        continue
                    t = str(btype[i]) if btype is not None and i < len(btype) else "BARCODE"
                    key = f"{t}:{d}"
                    if key not in seen:
                        seen.add(key)
                        pts = points[i].astype(np.int32) if points is not None else np.array([])
                        results.append({"type": t, "data": d, "polygon": pts, "rect": None})

    return results


# -- Drawing -----------------------------------------------------------------

def draw_results(frame, results):
    for item in results:
        color = color_for_type(item["type"])
        pts   = item.get("polygon")
        rect  = item.get("rect")
        label = f"{item['type']}: {item['data']}"

        if pts is not None and len(pts) >= 3:
            cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)
            tx, ty = int(pts[0][0]), max(int(pts[0][1]) - 10, 15)
        elif rect is not None:
            cv2.rectangle(frame, (rect.left, rect.top),
                          (rect.left + rect.width, rect.top + rect.height), color, 2)
            tx, ty = rect.left, max(rect.top - 10, 15)
        else:
            continue

        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(frame, (tx, ty - th - 4), (tx + tw + 6, ty + 4), color, -1)
        cv2.putText(frame, label, (tx + 3, ty),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)


def draw_hud(frame, fps, det_fps, preprocess_on, n_detected, exposure):
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (0, h - 44), (w, h), (30, 30, 30), -1)

    exp_str = f"  |  Exp:{exposure}" if exposure is not None else ""
    status = (f"Cam:{fps:.1f}fps  Det:{det_fps:.1f}fps"
              f"  Prep:{'ON' if preprocess_on else 'OFF'}"
              f"  Found:{n_detected}{exp_str}")
    cv2.putText(frame, status, (8, h - 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 200, 200), 1)

    hint = "q:Quit  s:Snapshot  p:Preprocess  e/E:Exposure  i:CamInfo"
    cv2.putText(frame, hint, (8, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (160, 160, 160), 1)

    guide = "Hold barcode 25-40 cm from lens"
    (gw, _), _ = cv2.getTextSize(guide, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    cv2.putText(frame, guide, (w - gw - 8, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 200, 255), 1)


# -- Camera helpers ----------------------------------------------------------

def find_camera(requested):
    if requested is not None:
        if isinstance(requested, str) and requested.startswith("/dev/"):
            return requested
        try:
            return int(requested)
        except ValueError:
            return requested
    try:
        from src.camera.usb_camera_detect import get_best_usb_camera
        dev = get_best_usb_camera()
        if dev:
            return dev
    except Exception:
        pass
    return 0


def tune_camera(cap, device, requested_exposure):
    """Boost sharpness and optionally lock exposure for cleaner barcode images."""
    cap.set(cv2.CAP_PROP_SHARPNESS, 255)

    dev_str = device if isinstance(device, str) else f"/dev/video{device}"
    try:
        subprocess.run(
            ["v4l2-ctl", "-d", dev_str, "--set-ctrl=sharpness=255"],
            capture_output=True, timeout=2,
        )
    except Exception:
        pass

    exposure = None
    if requested_exposure is not None:
        cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)   # 1 = manual on V4L2
        cap.set(cv2.CAP_PROP_EXPOSURE, requested_exposure)
        exposure = requested_exposure
    else:
        # Lock to a medium-short exposure to reduce motion blur
        cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)
        cap.set(cv2.CAP_PROP_EXPOSURE, 200)
        exposure = int(cap.get(cv2.CAP_PROP_EXPOSURE)) or None

    return exposure


def print_camera_info(device):
    dev_str = device if isinstance(device, str) else f"/dev/video{device}"
    print("\n--- Camera controls ---")
    try:
        out = subprocess.run(
            ["v4l2-ctl", "-d", dev_str, "--list-ctrls-menus"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        print(out.strip() or "(none)")
    except Exception as e:
        print(f"(could not query: {e})")
    print("-----------------------\n")


# -- Background detection thread ---------------------------------------------

class DetectionThread(threading.Thread):
    """Runs detect_barcodes() in a loop on the latest pushed frame.

    The display loop writes frames via push_frame() (non-blocking) and reads
    latest_results at any time without waiting for detection to finish.
    """

    def __init__(self, heavy_preprocess):
        super().__init__(daemon=True, name="barcode-detect")
        self._lock = threading.Lock()
        self._frame = None
        self._frame_id = 0
        self._last_id = -1
        self.latest_results = []
        self._running = True
        self._heavy = heavy_preprocess
        self._det_times = deque(maxlen=20)

    def set_heavy(self, val):
        self._heavy = val

    def push_frame(self, frame):
        with self._lock:
            self._frame = frame
            self._frame_id += 1

    def stop(self):
        self._running = False

    @property
    def det_fps(self):
        if len(self._det_times) < 2:
            return 0.0
        span = self._det_times[-1] - self._det_times[0]
        return (len(self._det_times) - 1) / span if span > 0 else 0.0

    def run(self):
        while self._running:
            with self._lock:
                if self._frame is None or self._frame_id == self._last_id:
                    frame = None
                else:
                    frame = self._frame.copy()
                    self._last_id = self._frame_id

            if frame is None:
                time.sleep(0.005)
                continue

            try:
                self.latest_results = detect_barcodes(frame, self._heavy)
                self._det_times.append(time.time())
            except Exception:
                pass


# -- Main --------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="remembR barcode/QR scanner")
    parser.add_argument("--device", "-d", default=None,
                        help="Camera index or /dev/videoN")
    parser.add_argument("--width",    type=int, default=640)
    parser.add_argument("--height",   type=int, default=480)
    parser.add_argument("--exposure", type=int, default=None,
                        help="Manual exposure (e.g. 150). Omit to use auto.")
    parser.add_argument("--no-display", action="store_true",
                        help="Headless -- print detections only, no window")
    args = parser.parse_args()

    if not HAS_PYZBAR and not HAS_CV_BARCODE:
        print("ERROR: Neither pyzbar nor OpenCV barcode detector available.")
        print("  pip install pyzbar   (requires: sudo apt install libzbar0)")
        sys.exit(1)

    print("=== remembR Barcode/QR Scanner ===")
    print(f"  pyzbar:              {HAS_PYZBAR}")
    print(f"  CV BarcodeDetector:  {HAS_CV_BARCODE}")
    print(f"  CV QRCodeDetector:   {HAS_CV_QR}")
    print()
    print("  NOTE: Fixed-focus camera -- no hardware focus control.")
    print("        Hold barcodes ~25-40 cm from the lens for best sharpness.")
    print("        Press 'e' to lower exposure (less motion blur at close range).")
    print()

    device   = find_camera(args.device)
    print(f"Opening camera: {device}")

    cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        print(f"ERROR: Could not open camera {device}")
        sys.exit(1)

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    exposure = tune_camera(cap, device, args.exposure)
    print(f"Camera {actual_w}x{actual_h}  |  exposure={exposure}")
    print("q=Quit  s=Snapshot  p=Preprocess(OFF)  e/E=Exposure  i=CamInfo")
    print()

    snap_dir = _project_root / "data" / "snapshots"
    snap_dir.mkdir(parents=True, exist_ok=True)

    det_thread = DetectionThread(heavy_preprocess=False)
    det_thread.start()

    preprocess_on = False
    fps = 0.0
    prev_time = time.time()
    frame_count = 0
    total_detected = 0
    last_reported = set()

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.02)
                continue

            det_thread.push_frame(frame)
            results = det_thread.latest_results

            # Console output -- only report each unique code once until it leaves frame
            for item in results:
                key = f"{item['type']}:{item['data']}"
                if key not in last_reported:
                    last_reported.add(key)
                    total_detected += 1
                    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    print(f"  [{ts}] {str(item['type']):12s}  {item['data']}")
            if not results:
                last_reported.clear()

            # FPS counter
            frame_count += 1
            now = time.time()
            elapsed = now - prev_time
            if elapsed >= 1.0:
                fps = frame_count / elapsed
                frame_count = 0
                prev_time = now

            if not args.no_display:
                draw_results(frame, results)
                draw_hud(frame, fps, det_thread.det_fps,
                         preprocess_on, len(results), exposure)
                cv2.imshow("remembR Barcode Scanner", frame)

                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                elif key == ord("s"):
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    path = snap_dir / f"barcode_{ts}.jpg"
                    cv2.imwrite(str(path), frame)
                    print(f"  Snapshot saved: {path}")
                elif key == ord("p"):
                    preprocess_on = not preprocess_on
                    det_thread.set_heavy(preprocess_on)
                    label = "ON (better blur tolerance, slower)" if preprocess_on else "OFF (fast)"
                    print(f"  Heavy preprocessing: {label}")
                elif key == ord("e"):
                    if exposure is None:
                        cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)
                        exposure = 200
                    exposure = max(50, exposure - 25)
                    cap.set(cv2.CAP_PROP_EXPOSURE, exposure)
                    print(f"  Exposure: {exposure}")
                elif key == ord("E"):
                    if exposure is None:
                        cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)
                        exposure = 200
                    exposure = min(1000, exposure + 25)
                    cap.set(cv2.CAP_PROP_EXPOSURE, exposure)
                    print(f"  Exposure: {exposure}")
                elif key == ord("i"):
                    print_camera_info(device)

    except KeyboardInterrupt:
        print("\nInterrupted.")
    finally:
        det_thread.stop()
        cap.release()
        if not args.no_display:
            cv2.destroyAllWindows()
        print(f"\nTotal unique barcodes detected: {total_detected}")


if __name__ == "__main__":
    main()
