"""
remembR main entry point.

Starts the FastAPI server with Hailo detection pipeline, object memory,
and WebSocket communication for the phone app.

Usage:
    python -m src.main
    python -m src.main --port 8000
    python -m src.main --camera /dev/video0
    python -m src.main --log-level DEBUG
"""

import argparse
import os
import sys
from pathlib import Path

# Ensure project root is on sys.path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

os.chdir(project_root)


def main():
    parser = argparse.ArgumentParser(description="remembR - Edge AI missing-object finder")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="HTTP port (default: 8000)")
    parser.add_argument("--camera", default=None, help="Camera device path (default: auto-detect)")
    parser.add_argument("--config", default="config/app_config.yaml", help="Config file path")
    parser.add_argument("--log-level", default=None, help="Log level override (DEBUG, INFO, WARNING, ERROR)")
    parser.add_argument("--no-hailo", action="store_true", help="Run without Hailo pipeline (API-only mode)")
    parser.add_argument("--tailscale-check", action="store_true", help="Print Tailscale info and exit")
    args = parser.parse_args()

    # Tailscale check mode
    if args.tailscale_check:
        from src.utils.logging_utils import setup_logging
        setup_logging(level="INFO")
        from src.transport.tailscale_utils import print_connection_info
        print_connection_info(port=args.port)
        return

    # Load config
    from src.api.app import load_config, create_app
    config = load_config(args.config)

    # Apply CLI overrides
    if args.camera:
        config.setdefault("camera", {})["device"] = args.camera
    if args.log_level:
        config.setdefault("logging", {})["level"] = args.log_level
    config.setdefault("server", {})["host"] = args.host
    config.setdefault("server", {})["port"] = args.port

    if args.no_hailo:
        config.setdefault("camera", {})["device"] = None

    # Create app
    app = create_app(config)

    # Run with uvicorn
    import uvicorn
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=(args.log_level or config.get("logging", {}).get("level", "info")).lower(),
    )


if __name__ == "__main__":
    main()
