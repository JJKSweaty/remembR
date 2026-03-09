"""
Camera low-latency tuning and mode selection utilities.

This module centralizes USB camera settings so the pipeline can be tuned in one
place and keeps startup behavior deterministic with clean fallbacks.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from typing import Any


DEFAULT_PIXEL_FORMATS = ("MJPG", "YUYV")


@dataclass(frozen=True)
class CameraSettings:
    """Configurable camera settings with low-latency defaults."""
    required: bool = True
    width: int = 640
    height: int = 480
    frame_rate: int = 30
    pixel_format: str = "AUTO"
    fallback_pixel_formats: tuple[str, ...] = DEFAULT_PIXEL_FORMATS
    buffer_size: int = 1
    queue_size: int = 2
    warmup_grabs: int = 2
    apply_v4l2_controls: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "required": self.required,
            "width": self.width,
            "height": self.height,
            "frame_rate": self.frame_rate,
            "pixel_format": self.pixel_format,
            "fallback_pixel_formats": list(self.fallback_pixel_formats),
            "buffer_size": self.buffer_size,
            "queue_size": self.queue_size,
            "warmup_grabs": self.warmup_grabs,
            "apply_v4l2_controls": self.apply_v4l2_controls,
        }


@dataclass(frozen=True)
class SelectedCameraMode:
    """Resolved camera mode after checking config + supported formats."""
    width: int
    height: int
    frame_rate: int
    pixel_format: str
    supported_formats: tuple[str, ...]
    mode_source: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "width": self.width,
            "height": self.height,
            "frame_rate": self.frame_rate,
            "pixel_format": self.pixel_format,
            "supported_formats": list(self.supported_formats),
            "mode_source": self.mode_source,
        }


def load_camera_settings(camera_cfg: dict[str, Any] | None) -> CameraSettings:
    """Build validated CameraSettings from app config."""
    cfg = camera_cfg or {}
    requested_format = _normalize_format(str(cfg.get("pixel_format", "auto")))

    fallback = cfg.get("fallback_pixel_formats", list(DEFAULT_PIXEL_FORMATS))
    if not isinstance(fallback, list):
        fallback = list(DEFAULT_PIXEL_FORMATS)
    fallback_formats = tuple(
        fmt for fmt in (_normalize_format(str(v)) for v in fallback) if fmt
    ) or DEFAULT_PIXEL_FORMATS

    return CameraSettings(
        required=bool(cfg.get("required", True)),
        width=max(160, int(cfg.get("width", 640))),
        height=max(120, int(cfg.get("height", 480))),
        frame_rate=max(1, int(cfg.get("frame_rate", 30))),
        pixel_format=requested_format or "AUTO",
        fallback_pixel_formats=fallback_formats,
        buffer_size=max(1, int(cfg.get("buffer_size", 1))),
        queue_size=max(1, int(cfg.get("queue_size", 2))),
        warmup_grabs=max(0, int(cfg.get("warmup_grabs", 2))),
        apply_v4l2_controls=bool(cfg.get("apply_v4l2_controls", True)),
    )


def resolve_camera_mode(
    device: str,
    settings: CameraSettings,
) -> SelectedCameraMode:
    """Select best camera pixel format with fallback if needed."""
    supported_formats = tuple(sorted(get_supported_v4l2_formats(device)))

    if settings.pixel_format != "AUTO":
        if not supported_formats or settings.pixel_format in supported_formats:
            return SelectedCameraMode(
                width=settings.width,
                height=settings.height,
                frame_rate=settings.frame_rate,
                pixel_format=settings.pixel_format,
                supported_formats=supported_formats,
                mode_source="configured",
            )

    preferred_formats: list[str] = []
    if settings.pixel_format == "AUTO":
        preferred_formats.extend(list(settings.fallback_pixel_formats))
    else:
        preferred_formats.append(settings.pixel_format)
        preferred_formats.extend(
            fmt for fmt in settings.fallback_pixel_formats if fmt != settings.pixel_format
        )

    for fmt in preferred_formats:
        if not supported_formats or fmt in supported_formats:
            return SelectedCameraMode(
                width=settings.width,
                height=settings.height,
                frame_rate=settings.frame_rate,
                pixel_format=fmt,
                supported_formats=supported_formats,
                mode_source="fallback",
            )

    return SelectedCameraMode(
        width=settings.width,
        height=settings.height,
        frame_rate=settings.frame_rate,
        pixel_format="MJPG",
        supported_formats=supported_formats,
        mode_source="default",
    )


def apply_v4l2_mode(device: str, mode: SelectedCameraMode) -> bool:
    """Try to apply low-latency camera mode via v4l2-ctl."""
    try:
        subprocess.run(
            [
                "v4l2-ctl",
                "-d",
                device,
                f"--set-fmt-video=width={mode.width},height={mode.height},pixelformat={mode.pixel_format}",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
        subprocess.run(
            ["v4l2-ctl", "-d", device, f"--set-parm={mode.frame_rate}"],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False


def get_active_v4l2_mode(device: str) -> dict[str, Any]:
    """Read active V4L2 settings for logging/diagnostics."""
    result: dict[str, Any] = {}
    try:
        fmt_out = subprocess.run(
            ["v4l2-ctl", "-d", device, "--get-fmt-video"],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        ).stdout
        parm_out = subprocess.run(
            ["v4l2-ctl", "-d", device, "--get-parm"],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return result

    width_match = re.search(r"Width/Height\s*:\s*(\d+)\s*/\s*(\d+)", fmt_out)
    if width_match:
        result["width"] = int(width_match.group(1))
        result["height"] = int(width_match.group(2))

    pix_match = re.search(r"Pixel Format\s*:\s*'([^']+)'", fmt_out)
    if pix_match:
        result["pixel_format"] = _normalize_format(pix_match.group(1))

    fps_match = re.search(r"Frames per second:\s*([0-9.]+)", parm_out)
    if fps_match:
        try:
            result["frame_rate"] = float(fps_match.group(1))
        except ValueError:
            pass

    return result


def get_supported_v4l2_formats(device: str) -> set[str]:
    """Return set of V4L2 pixel formats supported by a device."""
    try:
        output = subprocess.run(
            ["v4l2-ctl", "-d", device, "--list-formats-ext"],
            check=True,
            capture_output=True,
            text=True,
            timeout=4,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return set()

    formats: set[str] = set()
    for line in output.splitlines():
        match = re.search(r"'([^']+)'", line)
        if match:
            fmt = _normalize_format(match.group(1))
            if fmt:
                formats.add(fmt)
    return formats


def fourcc_from_pixel_format(pixel_format: str) -> str:
    """Map common V4L2 format names to OpenCV FourCC strings."""
    fmt = _normalize_format(pixel_format)
    if fmt == "MJPG":
        return "MJPG"
    if fmt in {"YUYV", "YUY2"}:
        return "YUYV"
    return fmt or "MJPG"


def _normalize_format(value: str) -> str:
    cleaned = value.strip().upper()
    if cleaned in {"", "NONE"}:
        return ""
    if cleaned in {"AUTO", "AUTOMATIC"}:
        return "AUTO"
    return cleaned
