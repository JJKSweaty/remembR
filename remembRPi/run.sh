#!/bin/bash
# remembR run script
# Activates the Hailo environment and starts the backend server.
#
# Usage:
#   ./run.sh                     # Auto-detect camera, default port 8000
#   ./run.sh --port 9000         # Custom port
#   ./run.sh --camera /dev/video2  # Explicit camera device
#   ./run.sh --log-level DEBUG   # Verbose logging
#   ./run.sh --no-hailo          # API-only mode (no detection pipeline)
#   ./run.sh --tailscale-check   # Print Tailscale info and exit

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

HAILO_EXAMPLES="${HAILO_EXAMPLES_PATH:-$HOME/hailo-rpi5-examples}"

echo "=================================="
echo "  remembR - Edge AI Object Finder"
echo "=================================="

# Activate Hailo venv if available
if [ -d "$HAILO_EXAMPLES/venv_hailo_rpi_examples" ]; then
    echo "Activating Hailo virtual environment..."
    source "$HAILO_EXAMPLES/venv_hailo_rpi_examples/bin/activate"
    export PYTHONPATH="$HAILO_EXAMPLES:$SCRIPT_DIR:${PYTHONPATH:-}"
    export HAILO_ENV_FILE="$HAILO_EXAMPLES/.env"
    echo "  Hailo venv active"
    echo "  PYTHONPATH includes: $HAILO_EXAMPLES"
else
    echo "WARNING: Hailo venv not found at $HAILO_EXAMPLES"
    echo "  Detection pipeline may not work without it."
    echo "  Set HAILO_EXAMPLES_PATH to override."
    export PYTHONPATH="$SCRIPT_DIR:${PYTHONPATH:-}"
fi

# Ensure project root is on PYTHONPATH
export PYTHONPATH="$SCRIPT_DIR:${PYTHONPATH:-}"

# Ensure data directories exist
mkdir -p data/snapshots data/logs static

echo ""
echo "Starting remembR server..."
echo "  Press Ctrl+C to stop"
echo ""

python3 -m src.main "$@"
