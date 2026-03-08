"""
Hailo GStreamer detection application for remembR.

Builds and runs the GStreamer detection pipeline using hailo-apps-infra,
following the pattern from hailo-rpi5-examples/basic_pipelines/detection_simple.py.

The detection pipeline structure is:
  SOURCE -> INFERENCE -> identity_callback -> DISPLAY

The identity_callback element is where our pad probe (app_callback) is attached.
This is handled automatically by the GStreamerDetectionApp.run() method.
"""

import os
import signal
import sys
import queue
import threading
from pathlib import Path

from src.utils.logging_utils import get_logger

try:
    from hailo_apps.hailo_app_python.apps.detection.detection_pipeline import (
        GStreamerDetectionApp,
    )
    HAILO_PIPELINE_AVAILABLE = True
except ImportError:
    HAILO_PIPELINE_AVAILABLE = False
    GStreamerDetectionApp = None


def setup_hailo_env(examples_path: str | None = None) -> bool:
    """Set up the Hailo environment variables and Python path.

    Mirrors what `source setup_env.sh` does:
    - Adds the examples repo root to PYTHONPATH
    - Sets HAILO_ENV_FILE to the .env in the examples repo

    Args:
        examples_path: Path to hailo-rpi5-examples repo. Auto-detected if None.

    Returns:
        True if environment is ready.
    """
    log = get_logger()

    if examples_path is None:
        # Try common locations
        candidates = [
            Path.home() / "hailo-rpi5-examples",
            Path("/home/jjk/hailo-rpi5-examples"),
        ]
        for p in candidates:
            if p.is_dir():
                examples_path = str(p)
                break

    if examples_path is None:
        log.error("hailo-rpi5-examples directory not found. "
                  "Set HAILO_EXAMPLES_PATH in config.")
        return False

    repo = Path(examples_path)
    if not repo.is_dir():
        log.error("Hailo examples path does not exist: %s", examples_path)
        return False

    # Add to PYTHONPATH (equivalent to setup_env.sh)
    repo_str = str(repo)
    if repo_str not in sys.path:
        sys.path.insert(0, repo_str)
    os.environ["PYTHONPATH"] = repo_str + ":" + os.environ.get("PYTHONPATH", "")

    # Set .env file path for hailo_apps environment loader
    env_file = repo / ".env"
    if env_file.exists():
        os.environ["HAILO_ENV_FILE"] = str(env_file)
        log.info("Hailo env file: %s", env_file)

    # Activate venv packages if available
    venv_site = repo / "venv_hailo_rpi_examples" / "lib"
    if venv_site.is_dir():
        # Find the python version subdirectory
        for pydir in venv_site.iterdir():
            sp = pydir / "site-packages"
            if sp.is_dir() and str(sp) not in sys.path:
                sys.path.insert(0, str(sp))
                log.info("Added Hailo venv site-packages: %s", sp)
                break

    log.info("Hailo environment configured from: %s", examples_path)
    return True


class HailoDetectionApp:
    """Manages the Hailo GStreamer detection pipeline lifecycle.

    Wraps hailo_apps GStreamerDetectionApp with remembR's callback and queue.
    Runs the GStreamer main loop in a dedicated thread so the rest of the
    application (HTTP server, WebSocket, etc.) can run concurrently.
    """

    def __init__(
        self,
        detection_queue: queue.Queue,
        frame_holder: dict,
        camera_device: str = "/dev/video0",
        use_frame: bool = True,
        arch: str = "auto",
    ):
        self._detection_queue = detection_queue
        self._frame_holder = frame_holder
        self._camera_device = camera_device
        self._use_frame = use_frame
        self._arch = arch
        self._thread: threading.Thread | None = None
        self._running = False
        self._app = None
        self._log = get_logger()

    def start(self) -> bool:
        """Start the detection pipeline in a background thread.

        Returns:
            True if pipeline started successfully.
        """
        if not HAILO_PIPELINE_AVAILABLE:
            self._log.error(
                "Hailo pipeline not available. Ensure you are running inside the "
                "Hailo venv (source setup_env.sh) and hailo-apps-infra is installed."
            )
            return False

        self._running = True
        self._thread = threading.Thread(target=self._run_pipeline, daemon=True)
        self._thread.start()
        self._log.info("Hailo detection pipeline thread started")
        return True

    def _run_pipeline(self) -> None:
        """Build and run the GStreamer detection pipeline.

        This method runs in a dedicated thread. The GLib main loop blocks
        until the pipeline is stopped.
        """
        from src.hailo.callback_handlers import (
            RemembRCallbackData,
            app_callback,
        )

        self._log.info("Building Hailo detection pipeline...")
        self._log.info("Camera device: %s", self._camera_device)

        try:
            # Set up sys.argv for the hailo_apps argument parser
            # These mimic: python detection.py --input /dev/videoX --use-frame
            argv_backup = sys.argv
            sys.argv = [
                "remembr_detection",
                "--input", self._camera_device,
                "--frame-rate", "30",
            ]
            if self._use_frame:
                sys.argv.append("--use-frame")

            # Resolve architecture: explicit value wins; "auto" falls back to
            # the hailo_arch key in the Hailo .env file.
            arch = self._arch
            if arch == "auto":
                arch = self._read_hailo_arch_from_env()
            if arch and arch != "auto":
                sys.argv += ["--arch", arch]
                self._log.info("Hailo architecture: %s", arch)

            user_data = RemembRCallbackData(
                detection_queue=self._detection_queue,
                frame_holder=self._frame_holder,
            )

            # GStreamerDetectionApp.__init__ calls signal.signal(SIGINT, ...)
            # which raises ValueError when executed from a non-main thread.
            # Patch signal.signal to a no-op for the duration of construction.
            _original_signal = signal.signal
            def _noop_signal(sig, handler):
                if threading.current_thread() is threading.main_thread():
                    _original_signal(sig, handler)
            signal.signal = _noop_signal
            try:
                self._app = GStreamerDetectionApp(app_callback, user_data)
            finally:
                signal.signal = _original_signal
            self._log.info("Hailo detection pipeline built successfully")

            self._app.run()

        except Exception as e:
            self._log.error("Hailo pipeline error: %s", e, exc_info=True)
        finally:
            self._running = False
            sys.argv = argv_backup
            self._log.info("Hailo detection pipeline stopped")

    def _read_hailo_arch_from_env(self) -> str | None:
        """Read hailo_arch from the Hailo .env file as auto-detection fallback."""
        env_file = os.environ.get("HAILO_ENV_FILE")
        if not env_file:
            return None
        try:
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("hailo_arch="):
                        return line.split("=", 1)[1].strip()
        except OSError:
            pass
        return None

    def stop(self) -> None:
        """Signal the pipeline to stop."""
        self._running = False
        if self._app is not None:
            try:
                # The GStreamer app should respond to EOS or pipeline state change
                self._log.info("Stopping Hailo pipeline...")
            except Exception:
                pass

    @property
    def is_running(self) -> bool:
        return self._running and self._thread is not None and self._thread.is_alive()
