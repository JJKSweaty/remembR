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
from typing import Any

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
        frame_rate: int = 30,
        frame_width: int = 640,
        frame_height: int = 480,
        pixel_format: str = "MJPG",
        arch: str = "auto",
    ):
        self._detection_queue = detection_queue
        self._frame_holder = frame_holder
        self._camera_device = camera_device
        self._use_frame = use_frame
        self._frame_rate = frame_rate
        self._frame_width = frame_width
        self._frame_height = frame_height
        self._pixel_format = pixel_format.upper()
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
        self._log.info(
            "Camera device: %s (target %dx%d@%dfps, %s)",
            self._camera_device,
            self._frame_width,
            self._frame_height,
            self._frame_rate,
            self._pixel_format,
        )

        try:
            from hailo_apps.hailo_app_python.core.common.core import (
                get_default_parser,
                get_resource_path,
            )
            from hailo_apps.hailo_app_python.core.common.installation_utils import detect_hailo_arch
            from hailo_apps.hailo_app_python.core.common.defines import (
                DETECTION_APP_TITLE,
                DETECTION_PIPELINE,
                RESOURCES_MODELS_DIR_NAME,
                RESOURCES_SO_DIR_NAME,
                DETECTION_POSTPROCESS_SO_FILENAME,
                DETECTION_POSTPROCESS_FUNCTION,
            )
            from hailo_apps.hailo_app_python.core.gstreamer.gstreamer_helper_pipelines import (
                SOURCE_PIPELINE,
                INFERENCE_PIPELINE,
                INFERENCE_PIPELINE_WRAPPER,
                TRACKER_PIPELINE,
                USER_CALLBACK_PIPELINE,
                DISPLAY_PIPELINE,
            )
            from hailo_apps.hailo_app_python.core.gstreamer.gstreamer_app import GStreamerApp
            import setproctitle

            class LowLatencyDetectionApp(GStreamerApp):
                """Detection app with explicit camera mode and reduced latency defaults."""

                def __init__(
                    self,
                    app_callback: Any,
                    user_data: Any,
                    camera_width: int,
                    camera_height: int,
                    no_webcam_compression: bool,
                    parser: Any = None,
                ) -> None:
                    if parser is None:
                        parser = get_default_parser()
                    parser.add_argument(
                        "--labels-json",
                        default=None,
                        help="Path to costume labels JSON file",
                    )
                    super().__init__(parser, user_data)

                    self.video_width = camera_width
                    self.video_height = camera_height
                    self.no_webcam_compression = no_webcam_compression
                    # Keep latency low, but not zero; zero can destabilize some camera drivers.
                    self.pipeline_latency = 60

                    self.batch_size = 2
                    nms_score_threshold = 0.3
                    nms_iou_threshold = 0.45

                    if self.options_menu.arch is None:
                        detected_arch = detect_hailo_arch()
                        if detected_arch is None:
                            raise ValueError("Could not auto-detect Hailo architecture. Please specify --arch manually.")
                        self.arch = detected_arch
                    else:
                        self.arch = self.options_menu.arch

                    if self.options_menu.hef_path is not None:
                        self.hef_path = self.options_menu.hef_path
                    else:
                        self.hef_path = get_resource_path(DETECTION_PIPELINE, RESOURCES_MODELS_DIR_NAME)

                    self.post_process_so = get_resource_path(
                        DETECTION_PIPELINE, RESOURCES_SO_DIR_NAME, DETECTION_POSTPROCESS_SO_FILENAME
                    )
                    self.post_function_name = DETECTION_POSTPROCESS_FUNCTION
                    self.labels_json = self.options_menu.labels_json
                    self.app_callback = app_callback
                    self.thresholds_str = (
                        f"nms-score-threshold={nms_score_threshold} "
                        f"nms-iou-threshold={nms_iou_threshold} "
                        "output-format-type=HAILO_FORMAT_TYPE_FLOAT32"
                    )
                    setproctitle.setproctitle(DETECTION_APP_TITLE)
                    self.create_pipeline()

                def get_pipeline_string(self) -> str:
                    source_pipeline = SOURCE_PIPELINE(
                        video_source=self.video_source,
                        video_width=self.video_width,
                        video_height=self.video_height,
                        no_webcam_compression=self.no_webcam_compression,
                        frame_rate=self.frame_rate,
                        sync=self.sync,
                    )
                    detection_pipeline = INFERENCE_PIPELINE(
                        hef_path=self.hef_path,
                        post_process_so=self.post_process_so,
                        post_function_name=self.post_function_name,
                        batch_size=self.batch_size,
                        config_json=self.labels_json,
                        additional_params=self.thresholds_str,
                    )
                    detection_pipeline_wrapper = INFERENCE_PIPELINE_WRAPPER(detection_pipeline)
                    tracker_pipeline = TRACKER_PIPELINE(class_id=1)
                    user_callback_pipeline = USER_CALLBACK_PIPELINE()
                    display_pipeline = DISPLAY_PIPELINE(
                        video_sink=self.video_sink,
                        sync=self.sync,
                        show_fps=self.show_fps,
                    )
                    return (
                        f"{source_pipeline} ! "
                        f"{detection_pipeline_wrapper} ! "
                        f"{tracker_pipeline} ! "
                        f"{user_callback_pipeline} ! "
                        f"{display_pipeline}"
                    )

            # Set up sys.argv for the hailo_apps argument parser
            # These mimic: python detection.py --input /dev/videoX --use-frame
            argv_backup = sys.argv
            sys.argv = [
                "remembr_detection",
                "--input", self._camera_device,
                "--frame-rate", str(self._frame_rate),
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
                self._app = LowLatencyDetectionApp(
                    app_callback=app_callback,
                    user_data=user_data,
                    camera_width=self._frame_width,
                    camera_height=self._frame_height,
                    no_webcam_compression=(self._pixel_format in {"YUYV", "YUY2"}),
                )
            finally:
                signal.signal = _original_signal

            self._minimize_pipeline_buffering()
            self._log.info("Hailo detection pipeline built successfully")

            self._app.run()

        except Exception as e:
            self._log.error("Hailo pipeline error: %s", e, exc_info=True)
        finally:
            self._running = False
            sys.argv = argv_backup
            self._log.info("Hailo detection pipeline stopped")

    def _minimize_pipeline_buffering(self) -> None:
        """Shrink GStreamer queues so preview stays on the newest frames."""
        if self._app is None or getattr(self._app, "pipeline", None) is None:
            return

        try:
            import gi
            gi.require_version("Gst", "1.0")
            from gi.repository import Gst

            self._app.pipeline_latency = 60
            pipeline = self._app.pipeline
            iterator = pipeline.iterate_elements()
            while True:
                result, element = iterator.next()
                if result != Gst.IteratorResult.OK:
                    if result == Gst.IteratorResult.DONE:
                        break
                    break
                factory = element.get_factory()
                factory_name = factory.get_name() if factory else ""
                element_name = element.get_name() or ""

                if factory_name == "queue":
                    # Only tune source/display/callback edge queues to avoid starving
                    # inference/tracker internals that are more sensitive to drops.
                    if not (
                        element_name.startswith("source_")
                        or element_name.startswith("identity_callback")
                        or element_name.startswith("hailo_display")
                    ):
                        continue
                    try:
                        element.set_property("max-size-buffers", 2)
                        element.set_property("max-size-bytes", 0)
                        element.set_property("max-size-time", 0)
                        # 2 = downstream (drop oldest when full)
                        element.set_property("leaky", 2)
                    except Exception:
                        pass
        except Exception as e:
            self._log.debug("Could not tune GStreamer queue/source properties: %s", e)

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
