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
USER_ID="$(id -u)"

echo "=================================="
echo "  remembR - Edge AI Object Finder"
echo "=================================="

# Ensure GUI/runtime env vars exist for GTK/Hailo apps.
if [ -z "${XDG_RUNTIME_DIR:-}" ] || [ ! -d "${XDG_RUNTIME_DIR:-}" ]; then
    if [ -d "/run/user/$USER_ID" ]; then
        export XDG_RUNTIME_DIR="/run/user/$USER_ID"
    else
        export XDG_RUNTIME_DIR="/tmp/xdg-runtime-$USER_ID"
        mkdir -p "$XDG_RUNTIME_DIR"
        chmod 700 "$XDG_RUNTIME_DIR" 2>/dev/null || true
    fi
fi

# Use an installed UTF-8 locale to avoid GTK locale fallback warnings.
if command -v locale >/dev/null 2>&1; then
    if [ -z "${LANG:-}" ] || ! locale -a 2>/dev/null | grep -qi "^${LANG//./\\.}\$"; then
        for candidate in C.UTF-8 en_US.utf8; do
            if locale -a 2>/dev/null | grep -qi "^${candidate//./\\.}\$"; then
                export LANG="$candidate"
                export LC_ALL="$candidate"
                break
            fi
        done
    fi
fi

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
    if [ -d "$SCRIPT_DIR/.venv" ]; then
        echo "Activating local virtual environment..."
        # shellcheck disable=SC1090
        source "$SCRIPT_DIR/.venv/bin/activate"
        echo "  Local venv active"
    fi
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

# Determine target port from CLI args (default: 8000)
PORT=8000
PREV=""
for arg in "$@"; do
    if [ "$PREV" = "--port" ]; then
        PORT="$arg"
        PREV=""
        continue
    fi

    case "$arg" in
        --port=*)
            PORT="${arg#--port=}"
            ;;
        --port)
            PREV="--port"
            ;;
    esac
done

# Kill any process holding the Hailo device (prevents HAILO_OUT_OF_PHYSICAL_DEVICES).
_kill_pids() {
    local label="$1"; shift
    local pids="$*"
    [ -z "$pids" ] && return
    echo "  Stopping $label (PID $pids)..."
    kill $pids 2>/dev/null || true
    sleep 1
    # Force-kill if still alive
    local still=""
    for p in $pids; do
        kill -0 "$p" 2>/dev/null && still="$still $p" || true
    done
    [ -n "$still" ] && kill -9 $still 2>/dev/null || true
}

if [ -e /dev/hailo0 ]; then
    HAILO_PIDS="$(fuser /dev/hailo0 2>/dev/null || true)"
    _kill_pids "Hailo device holder" $HAILO_PIDS
fi

# Kill anything currently listening on ports 8000 and 8001
# (catches both the target port and the other common remembR port).
if command -v lsof >/dev/null 2>&1; then
    for _port in 8000 8001 "$PORT"; do
        _pids="$(lsof -tiTCP:"$_port" -sTCP:LISTEN 2>/dev/null || true)"
        [ -z "$_pids" ] && continue
        _label="process on port $_port"
        _kill_pids "$_label" $_pids
    done
else
    echo "WARNING: lsof not found; cannot auto-stop existing processes."
fi

python3 -m src.main "$@"
