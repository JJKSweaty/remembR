"""
USB camera discovery and validation utilities.

Detects available USB webcams by querying /dev/video* devices and filtering
for actual USB capture devices using udevadm, matching the approach used
by hailo-rpi5-examples camera_utils.py.
"""

import os
import subprocess
from pathlib import Path

from src.utils.logging_utils import get_logger


def discover_usb_cameras() -> list[str]:
    """Find USB video capture devices.

    Scans /dev/video* and uses udevadm to identify USB-bus capture devices,
    following the same approach as hailo_apps camera_utils.get_usb_video_devices().

    Returns:
        List of device paths like ["/dev/video0"].
    """
    log = get_logger()
    candidates: list[str] = []

    video_devices = sorted(Path("/dev").glob("video*"))
    if not video_devices:
        log.warning("No /dev/video* devices found")
        return []

    for dev in video_devices:
        dev_path = str(dev)
        try:
            result = subprocess.run(
                ["udevadm", "info", "--query=all", f"--name={dev_path}"],
                capture_output=True, text=True, timeout=5,
            )
            output = result.stdout
            # Must be USB bus AND a capture device (not metadata)
            if "ID_BUS=usb" in output and ":capture:" in output:
                candidates.append(dev_path)
                log.debug("Found USB capture device: %s", dev_path)
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
            log.debug("Could not query udevadm for %s: %s", dev_path, e)

    if not candidates:
        log.warning("No USB capture devices found via udevadm. "
                     "Falling back to /dev/video0 if it exists.")
        if Path("/dev/video0").exists():
            candidates.append("/dev/video0")

    return candidates


def get_best_usb_camera() -> str | None:
    """Return the best USB camera device path, or None if none found."""
    cameras = discover_usb_cameras()
    if cameras:
        get_logger().info("Selected USB camera: %s", cameras[0])
        return cameras[0]
    return None


def validate_camera(device: str) -> bool:
    """Check that a camera device exists and is readable."""
    path = Path(device)
    if not path.exists():
        get_logger().error("Camera device does not exist: %s", device)
        return False
    if not path.is_char_device():
        get_logger().error("Not a character device: %s", device)
        return False
    if not os.access(device, os.R_OK):
        get_logger().error("No read permission on: %s", device)
        return False
    return True
