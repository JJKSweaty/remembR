#!/usr/bin/env python3
"""
Quick USB camera latency/stability probe for Raspberry Pi.

Reports:
- effective FPS
- frame read latency (ms)
- read jitter
- duplicate-frame ratio (stutter proxy)
- active V4L2 mode (if v4l2-ctl is available)
"""

from __future__ import annotations

import argparse
import statistics
import subprocess
import time

import cv2


def _active_v4l2_mode(device: str) -> str:
    try:
        fmt = subprocess.run(
            ["v4l2-ctl", "-d", device, "--get-fmt-video"],
            check=True,
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout.strip()
        parm = subprocess.run(
            ["v4l2-ctl", "-d", device, "--get-parm"],
            check=True,
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout.strip()
        return f"{fmt}\n{parm}"
    except Exception:
        return "Unavailable (v4l2-ctl missing or not permitted)"


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure webcam FPS and latency behavior")
    parser.add_argument("--device", default="/dev/video0")
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--pixel-format", default="MJPG", choices=["MJPG", "YUYV"])
    parser.add_argument("--buffer-size", type=int, default=1)
    parser.add_argument("--warmup-grabs", type=int, default=2)
    parser.add_argument("--frames", type=int, default=300)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.device, cv2.CAP_V4L2)
    if not cap.isOpened():
        print(f"ERROR: unable to open camera {args.device}")
        return 2

    fourcc = cv2.VideoWriter_fourcc(*args.pixel_format)
    cap.set(cv2.CAP_PROP_FOURCC, fourcc)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    cap.set(cv2.CAP_PROP_FPS, args.fps)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, args.buffer_size)

    for _ in range(max(0, args.warmup_grabs)):
        cap.grab()

    print("Camera request:")
    print(
        f"  device={args.device} mode={args.pixel_format} "
        f"{args.width}x{args.height}@{args.fps} buffer={args.buffer_size}"
    )
    print("Active V4L2 mode:")
    print(_active_v4l2_mode(args.device))

    read_ms: list[float] = []
    frame_hashes: list[int] = []
    start = time.perf_counter()

    for _ in range(args.frames):
        t0 = time.perf_counter()
        ok, frame = cap.read()
        t1 = time.perf_counter()
        if not ok or frame is None:
            continue
        read_ms.append((t1 - t0) * 1000.0)
        small = cv2.resize(frame, (32, 18))
        frame_hashes.append(hash(small.tobytes()))

    elapsed = time.perf_counter() - start
    cap.release()

    if not read_ms:
        print("ERROR: no frames captured")
        return 3

    effective_fps = len(read_ms) / elapsed if elapsed > 0 else 0.0
    dupes = sum(1 for i in range(1, len(frame_hashes)) if frame_hashes[i] == frame_hashes[i - 1])
    dupe_ratio = (dupes / max(1, len(frame_hashes) - 1)) * 100.0
    p95 = max(read_ms)
    if len(read_ms) >= 20:
        p95 = statistics.quantiles(read_ms, n=20)[18]

    print("\nResults:")
    print(f"  frames_captured={len(read_ms)}")
    print(f"  elapsed_s={elapsed:.2f}")
    print(f"  effective_fps={effective_fps:.2f}")
    print(f"  read_latency_ms_avg={statistics.mean(read_ms):.2f}")
    print(f"  read_latency_ms_p95={p95:.2f}")
    print(f"  read_latency_ms_max={max(read_ms):.2f}")
    print(f"  read_jitter_ms_stdev={statistics.pstdev(read_ms):.2f}")
    print(f"  duplicate_frame_ratio_pct={dupe_ratio:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
