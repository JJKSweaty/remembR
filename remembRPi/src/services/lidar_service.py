"""
LiDAR distance measurement service.

Reads distance data from a serial LiDAR sensor (e.g., TFmini, TFmini Plus,
or similar UART-based rangefinder) connected to the Raspberry Pi.

Used to add rough distance hints to object finding responses:
  "about 1.5 meters away"
  "within arm's reach"

Graceful degradation: if LiDAR is not connected or fails, the system
continues with vision-only object finding.
"""

import threading
import time

from src.utils.logging_utils import get_logger


def _describe_distance(meters: float) -> str:
    """Convert a distance in meters to a human-friendly phrase."""
    if meters < 0.5:
        return "within arm's reach"
    if meters < 1.0:
        return "about half a meter away"
    if meters < 2.0:
        return f"about {meters:.1f} meters away"
    if meters < 5.0:
        return f"roughly {meters:.1f} meters away"
    return f"about {meters:.0f} meters away"


class LidarService:
    """Reads distance from a serial LiDAR sensor."""

    def __init__(
        self,
        port: str = "/dev/ttyAMA0",
        baudrate: int = 115200,
    ):
        self._port = port
        self._baudrate = baudrate
        self._log = get_logger()
        self._available = False
        self._running = False
        self._thread: threading.Thread | None = None
        self._distance_m: float | None = None
        self._signal_strength: int | None = None
        self._last_read_time: float | None = None
        self._serial = None

    @property
    def available(self) -> bool:
        return self._available

    @property
    def distance_m(self) -> float | None:
        return self._distance_m

    @property
    def distance_text(self) -> str | None:
        if self._distance_m is None:
            return None
        return _describe_distance(self._distance_m)

    def start(self) -> bool:
        """Start reading from the LiDAR sensor.

        Returns True if the serial port opened successfully.
        """
        try:
            import serial
            self._serial = serial.Serial(
                port=self._port,
                baudrate=self._baudrate,
                timeout=1.0,
            )
            self._available = True
            self._running = True
            self._thread = threading.Thread(
                target=self._read_loop, daemon=True, name="lidar-reader"
            )
            self._thread.start()
            self._log.info("LiDAR started on %s", self._port)
            return True
        except ImportError:
            self._log.warning("pyserial not installed; LiDAR disabled")
        except Exception as e:
            self._log.warning("LiDAR not available on %s: %s", self._port, e)
        self._available = False
        return False

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
        if self._serial and self._serial.is_open:
            self._serial.close()

    def get_distance(self) -> dict:
        """Get the latest distance reading."""
        if not self._available or self._distance_m is None:
            return {
                "available": False,
                "distance_m": None,
                "distance_text": None,
            }
        age = time.time() - (self._last_read_time or 0)
        if age > 2.0:
            return {
                "available": True,
                "distance_m": None,
                "distance_text": None,
                "stale": True,
            }
        return {
            "available": True,
            "distance_m": round(self._distance_m, 2),
            "distance_text": _describe_distance(self._distance_m),
            "signal_strength": self._signal_strength,
        }

    def _read_loop(self) -> None:
        """Continuously read TFmini-style 9-byte frames from serial."""
        buf = bytearray()
        while self._running:
            try:
                data = self._serial.read(9)
                if not data:
                    continue
                buf.extend(data)

                # TFmini frame: 0x59 0x59 <dist_lo> <dist_hi> <str_lo> <str_hi> <mode> <0> <checksum>
                while len(buf) >= 9:
                    # Find frame header
                    idx = -1
                    for i in range(len(buf) - 1):
                        if buf[i] == 0x59 and buf[i + 1] == 0x59:
                            idx = i
                            break
                    if idx < 0:
                        buf = buf[-1:]
                        break
                    if idx + 9 > len(buf):
                        break

                    frame = buf[idx : idx + 9]
                    buf = buf[idx + 9 :]

                    # Verify checksum
                    checksum = sum(frame[:8]) & 0xFF
                    if checksum != frame[8]:
                        continue

                    dist_cm = frame[2] + (frame[3] << 8)
                    strength = frame[4] + (frame[5] << 8)

                    if dist_cm > 0 and strength > 100:
                        self._distance_m = dist_cm / 100.0
                        self._signal_strength = strength
                        self._last_read_time = time.time()

            except Exception as e:
                self._log.error("LiDAR read error: %s", e)
                time.sleep(1.0)

    def to_status_dict(self) -> dict:
        return {
            "available": self._available,
            "port": self._port,
            "distance_m": self._distance_m,
            "last_read_time": self._last_read_time,
        }
