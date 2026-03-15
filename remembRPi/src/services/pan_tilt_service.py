"""Pan-tilt servo control service for Raspberry Pi + PCA9685.

This implementation controls servos directly from the Pi using
Adafruit ServoKit (PCA9685).

Important safety limits are mirrored from `espRmbr/main/main.c`:
- PAN_MIN_US  = 500
- PAN_MAX_US  = 1800
- TILT_MIN_US = 200
- TILT_MAX_US = 1700
"""

from __future__ import annotations

import asyncio
import time
from typing import Callable

from src.utils.logging_utils import get_logger

try:
    from adafruit_servokit import ServoKit
except ImportError:  # pragma: no cover - hardware dependency
    ServoKit = None


class PanTiltService:
    """Pi-local pan/tilt service with interruptible slow search sweep."""

    def __init__(
        self,
        i2c_address: int = 0x40,
        channels: int = 16,
        pwm_frequency_hz: int = 50,
        pan_servo: int = 1,
        tilt_servo: int = 2,
        # Safe ranges copied from espRmbr/main/main.c
        pan_min_us: int = 500,
        pan_max_us: int = 1800,
        tilt_min_us: int = 200,
        tilt_max_us: int = 1700,
        servo_abs_min_us: int = 200,
        servo_abs_max_us: int = 2800,
        pan_step_us: int = 30,
        tilt_step_us: int = 12,
        step_delay_ms: int = 180,
        edge_delay_ms: int = 260,
        sweep_timeout_s: float = 30.0,
        search_timeout_s: float = 30.0,
        detection_confidence_threshold: float = 0.60,
        snapshot_delay_ms: int = 500,
    ):
        self._log = get_logger()

        self._i2c_address = i2c_address
        self._channels = channels
        self._pwm_frequency_hz = pwm_frequency_hz

        # Hardware mapping requirement: Pan=servo1, Tilt=servo2
        # ServoKit uses 0-based indexing internally.
        self._pan_servo_number = int(pan_servo)
        self._tilt_servo_number = int(tilt_servo)
        self._pan_channel = self._pan_servo_number - 1
        self._tilt_channel = self._tilt_servo_number - 1

        self._pan_min_us = int(pan_min_us)
        self._pan_max_us = int(pan_max_us)
        self._tilt_min_us = int(tilt_min_us)
        self._tilt_max_us = int(tilt_max_us)
        self._servo_abs_min_us = int(servo_abs_min_us)
        self._servo_abs_max_us = int(servo_abs_max_us)

        self._pan_step_us = max(1, int(pan_step_us))
        self._tilt_step_us = max(1, int(tilt_step_us))
        self._step_delay_s = max(0.01, float(step_delay_ms) / 1000.0)
        self._edge_delay_s = max(0.01, float(edge_delay_ms) / 1000.0)
        self._sweep_timeout_s = max(0.5, float(sweep_timeout_s))
        self._search_timeout_s = max(0.5, float(search_timeout_s))
        self._detection_confidence_threshold = float(detection_confidence_threshold)
        self._snapshot_delay_s = max(0.05, float(snapshot_delay_ms) / 1000.0)

        self._available = False
        self._sweeping = False
        self._last_sweep_time: float | None = None

        self._kit = None
        self._pan_servo = None
        self._tilt_servo = None

        self._pan_us = (self._pan_min_us + self._pan_max_us) // 2
        self._tilt_us = (self._tilt_min_us + self._tilt_max_us) // 2
        self._pan_initialized = False
        self._tilt_initialized = False

        self._motion_lock = asyncio.Lock()
        self._stop_event = asyncio.Event()

    @property
    def available(self) -> bool:
        return self._available

    @property
    def sweeping(self) -> bool:
        return self._sweeping

    @property
    def pan_us(self) -> int:
        return self._pan_us

    @property
    def tilt_us(self) -> int:
        return self._tilt_us

    @property
    def detection_confidence_threshold(self) -> float:
        return self._detection_confidence_threshold

    @property
    def snapshot_delay_seconds(self) -> float:
        return self._snapshot_delay_s

    async def check_connection(self) -> bool:
        """Initialize ServoKit/PCA9685 and verify channels are accessible."""
        if ServoKit is None:
            self._log.warning(
                "Adafruit ServoKit not installed. "
                "Install adafruit-circuitpython-servokit on the Pi."
            )
            self._available = False
            return False

        if self._pan_channel < 0 or self._tilt_channel < 0:
            self._log.error(
                "Invalid servo mapping: pan=%s tilt=%s (expected 1-based servo numbers)",
                self._pan_servo_number,
                self._tilt_servo_number,
            )
            self._available = False
            return False

        try:
            self._kit = ServoKit(
                channels=self._channels,
                address=self._i2c_address,
                frequency=self._pwm_frequency_hz,
            )
            self._pan_servo = self._kit.servo[self._pan_channel]
            self._tilt_servo = self._kit.servo[self._tilt_channel]
            self._pan_initialized = False
            self._tilt_initialized = False

            # Keep ServoKit pulse mapping broad enough for safe clamped writes.
            self._pan_servo.set_pulse_width_range(
                self._servo_abs_min_us, self._servo_abs_max_us
            )
            self._tilt_servo.set_pulse_width_range(
                self._servo_abs_min_us, self._servo_abs_max_us
            )

            self._available = True
            self._log.info(
                "Pan-tilt PCA9685 ready at 0x%02X (pan servo=%d, tilt servo=%d)",
                self._i2c_address,
                self._pan_servo_number,
                self._tilt_servo_number,
            )
            return True
        except Exception as e:
            self._available = False
            self._kit = None
            self._pan_servo = None
            self._tilt_servo = None
            self._pan_initialized = False
            self._tilt_initialized = False
            self._log.warning("Pan-tilt controller unavailable: %s", e)
            return False

    async def stop(self) -> dict:
        """Request the current sweep/search motion to stop."""
        self._stop_event.set()
        return {"status": "ok", "message": "Stop requested"}

    async def sweep(self) -> dict:
        """Run serpentine sweep for configured sweep timeout."""
        return await self._run_serpentine(
            timeout_s=self._sweep_timeout_s,
            target_detected=None,
        )

    async def search_for_target(
        self,
        target_detected: Callable[[], bool],
        timeout_s: float | None = None,
    ) -> dict:
        """Sweep until target is detected or timeout elapses."""
        return await self._run_serpentine(
            timeout_s=timeout_s if timeout_s is not None else self._search_timeout_s,
            target_detected=target_detected,
        )

    async def center(self) -> dict:
        """Center pan and tilt within safe limits."""
        if not self._available:
            return {"status": "unavailable", "message": "Pan-tilt controller not connected"}

        pan_center = (self._pan_min_us + self._pan_max_us) // 2
        tilt_center = (self._tilt_min_us + self._tilt_max_us) // 2

        async with self._motion_lock:
            self._stop_event.clear()
            await self._move_to_locked(pan_target=pan_center, tilt_target=tilt_center)

        return {
            "status": "ok",
            "message": "Centered",
            "pan_us": self._pan_us,
            "tilt_us": self._tilt_us,
        }

    async def set_pan(self, us: int) -> dict:
        """Set pan servo position within safe limits."""
        if not self._available:
            return {"status": "unavailable", "message": "Pan-tilt controller not connected"}

        async with self._motion_lock:
            self._stop_event.clear()
            await self._move_to_locked(pan_target=us, tilt_target=None)

        return {"status": "ok", "pan_us": self._pan_us}

    async def set_tilt(self, us: int) -> dict:
        """Set tilt servo position within safe limits."""
        if not self._available:
            return {"status": "unavailable", "message": "Pan-tilt controller not connected"}

        async with self._motion_lock:
            self._stop_event.clear()
            await self._move_to_locked(pan_target=None, tilt_target=us)

        return {"status": "ok", "tilt_us": self._tilt_us}

    async def get_status(self) -> dict:
        """Return live pan-tilt status."""
        return self.to_status_dict()

    async def _run_serpentine(
        self,
        timeout_s: float,
        target_detected: Callable[[], bool] | None,
    ) -> dict:
        if self._sweeping:
            return {"status": "busy", "message": "Sweep already in progress"}

        if not self._available:
            return {"status": "unavailable", "message": "Pan-tilt controller not connected"}

        timeout_s = max(0.5, float(timeout_s))
        started = time.monotonic()

        async with self._motion_lock:
            self._sweeping = True
            self._stop_event.clear()
            try:
                # Start from current position and scan with slow pan + slight
                # tilt adjustment on every step.
                pan_direction = (
                    1
                    if abs(self._pan_us - self._pan_min_us)
                    <= abs(self._pan_us - self._pan_max_us)
                    else -1
                )
                tilt_direction = (
                    1
                    if abs(self._tilt_us - self._tilt_min_us)
                    <= abs(self._tilt_us - self._tilt_max_us)
                    else -1
                )

                # Ensure outputs are initialized.
                self._apply_position(pan_us=self._pan_us, tilt_us=self._tilt_us)

                while (time.monotonic() - started) < timeout_s:
                    if self._stop_event.is_set():
                        return self._result("stopped", "Sweep stopped", started)
                    if self._target_detected(target_detected):
                        return self._result("found", "Target detected", started)

                    hit_pan_edge = False

                    next_pan = self._pan_us + (pan_direction * self._pan_step_us)
                    if next_pan >= self._pan_max_us:
                        next_pan = self._pan_max_us
                        pan_direction = -1
                        hit_pan_edge = True
                    elif next_pan <= self._pan_min_us:
                        next_pan = self._pan_min_us
                        pan_direction = 1
                        hit_pan_edge = True

                    next_tilt = self._tilt_us + (tilt_direction * self._tilt_step_us)
                    if next_tilt >= self._tilt_max_us:
                        next_tilt = self._tilt_max_us
                        tilt_direction = -1
                    elif next_tilt <= self._tilt_min_us:
                        next_tilt = self._tilt_min_us
                        tilt_direction = 1

                    await self._move_to_locked(
                        pan_target=next_pan,
                        tilt_target=next_tilt,
                    )

                    if self._target_detected(target_detected):
                        return self._result("found", "Target detected", started)
                    if (time.monotonic() - started) >= timeout_s:
                        break

                    if hit_pan_edge:
                        await asyncio.sleep(self._edge_delay_s)

                status = "timeout" if target_detected else "ok"
                message = "Search timed out" if target_detected else "Sweep complete"
                return self._result(status, message, started)
            except Exception as e:
                self._log.error("Pan-tilt sweep failed: %s", e, exc_info=True)
                return self._result("error", str(e), started)
            finally:
                self._sweeping = False
                self._stop_event.clear()
                self._last_sweep_time = time.time()

    async def _move_to_locked(
        self,
        pan_target: int | None,
        tilt_target: int | None,
    ) -> None:
        target_pan = self._pan_us if pan_target is None else self._clamp_pan(pan_target)
        target_tilt = self._tilt_us if tilt_target is None else self._clamp_tilt(tilt_target)

        # Ensure at least one hardware write happens after startup/reconnect.
        if self._pan_us == target_pan and self._tilt_us == target_tilt:
            self._apply_position(
                pan_us=target_pan if pan_target is not None else None,
                tilt_us=target_tilt if tilt_target is not None else None,
            )
            return

        while self._pan_us != target_pan or self._tilt_us != target_tilt:
            if self._stop_event.is_set():
                break

            next_pan = self._pan_us
            next_tilt = self._tilt_us

            if self._pan_us != target_pan:
                next_pan = self._step_towards(self._pan_us, target_pan, self._pan_step_us)
            if self._tilt_us != target_tilt:
                next_tilt = self._step_towards(self._tilt_us, target_tilt, self._tilt_step_us)

            self._apply_position(pan_us=next_pan, tilt_us=next_tilt)
            await asyncio.sleep(self._step_delay_s)

    def _target_detected(self, target_detected: Callable[[], bool] | None) -> bool:
        if target_detected is None:
            return False
        try:
            return bool(target_detected())
        except Exception as e:
            self._log.debug("Target detection callback error: %s", e)
            return False

    def _apply_position(self, pan_us: int | None, tilt_us: int | None) -> None:
        if not self._available or self._pan_servo is None or self._tilt_servo is None:
            return

        if pan_us is not None:
            pan_safe = self._clamp_pan(pan_us)
            if pan_safe != self._pan_us or not self._pan_initialized:
                pan_angle = self._us_to_angle(pan_safe, self._pan_min_us, self._pan_max_us)
                self._pan_servo.angle = pan_angle
                self._pan_us = pan_safe
                self._pan_initialized = True

        if tilt_us is not None:
            tilt_safe = self._clamp_tilt(tilt_us)
            if tilt_safe != self._tilt_us or not self._tilt_initialized:
                tilt_angle = self._us_to_angle(tilt_safe, self._tilt_min_us, self._tilt_max_us)
                self._tilt_servo.angle = tilt_angle
                self._tilt_us = tilt_safe
                self._tilt_initialized = True

    def _clamp_pan(self, us: int) -> int:
        return max(self._pan_min_us, min(self._pan_max_us, int(us)))

    def _clamp_tilt(self, us: int) -> int:
        return max(self._tilt_min_us, min(self._tilt_max_us, int(us)))

    @staticmethod
    def _step_towards(current: int, target: int, step: int) -> int:
        if current == target:
            return target
        if current < target:
            return min(current + step, target)
        return max(current - step, target)

    @staticmethod
    def _us_to_angle(us: int, lo: int, hi: int) -> float:
        if hi <= lo:
            return 90.0
        ratio = (us - lo) / float(hi - lo)
        ratio = max(0.0, min(1.0, ratio))
        return ratio * 180.0

    @staticmethod
    def _elapsed_seconds(start_monotonic: float) -> float:
        return round(time.monotonic() - start_monotonic, 2)

    def _result(self, status: str, message: str, started: float) -> dict:
        return {
            "status": status,
            "message": message,
            "duration_seconds": self._elapsed_seconds(started),
        }

    def to_status_dict(self) -> dict:
        """Return service status for health endpoint."""
        return {
            "available": self._available,
            "sweeping": self._sweeping,
            "last_sweep_time": self._last_sweep_time,
            "i2c_address": f"0x{self._i2c_address:02X}",
            "pan_servo": self._pan_servo_number,
            "tilt_servo": self._tilt_servo_number,
            "pan_us": self._pan_us,
            "tilt_us": self._tilt_us,
            "pan_min_us": self._pan_min_us,
            "pan_max_us": self._pan_max_us,
            "tilt_min_us": self._tilt_min_us,
            "tilt_max_us": self._tilt_max_us,
            "pan_step_us": self._pan_step_us,
            "tilt_step_us": self._tilt_step_us,
            "step_delay_ms": int(self._step_delay_s * 1000),
            "edge_delay_ms": int(self._edge_delay_s * 1000),
            "search_timeout_s": self._search_timeout_s,
            "sweep_timeout_s": self._sweep_timeout_s,
            "detection_confidence_threshold": self._detection_confidence_threshold,
            "snapshot_delay_ms": int(self._snapshot_delay_s * 1000),
        }
