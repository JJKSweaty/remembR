#!/bin/bash
# remembR setup script
# Installs Python dependencies and prepares the data directories.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================="
echo "  remembR Setup"
echo "=================================="
echo ""

# Check Python version
PYTHON=$(command -v python3 || echo "python")
echo "Python: $($PYTHON --version 2>&1)"

# Choose install environment (never system-wide pip)
HAILO_EXAMPLES="${HAILO_EXAMPLES_PATH:-$HOME/hailo-rpi5-examples}"
HAILO_VENV="$HAILO_EXAMPLES/venv_hailo_rpi_examples"
LOCAL_VENV="$SCRIPT_DIR/.venv"

echo ""
if [ -d "$HAILO_VENV" ]; then
    echo "Using Hailo virtual environment: $HAILO_VENV"
    # shellcheck disable=SC1090
    source "$HAILO_VENV/bin/activate"
elif [ -d "$LOCAL_VENV" ]; then
    echo "Using local virtual environment: $LOCAL_VENV"
    # shellcheck disable=SC1090
    source "$LOCAL_VENV/bin/activate"
else
    echo "Creating local virtual environment: $LOCAL_VENV"
    "$PYTHON" -m venv "$LOCAL_VENV"
    # shellcheck disable=SC1090
    source "$LOCAL_VENV/bin/activate"
fi

PYTHON_BIN="$(command -v python)"
echo "Active venv python: $PYTHON_BIN"
echo "Active venv version: $(python --version 2>&1)"

# Create data directories
echo ""
echo "Creating data directories..."
mkdir -p data/snapshots data/logs static

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
python -m pip install --upgrade pip setuptools wheel >/dev/null
python -m pip install -r requirements.txt
echo "Dependencies installed."

# Check for Hailo
echo ""
echo "Checking Hailo environment..."
if command -v hailortcli &>/dev/null; then
    echo "  hailortcli found: $(hailortcli --version 2>&1 | head -1)"
else
    echo "  WARNING: hailortcli not found."
fi

if [ -d "$HOME/hailo-rpi5-examples" ]; then
    echo "  hailo-rpi5-examples found at: $HOME/hailo-rpi5-examples"
    if [ -d "$HOME/hailo-rpi5-examples/venv_hailo_rpi_examples" ]; then
        echo "  Hailo venv found."
    else
        echo "  WARNING: Hailo venv not found. Run install.sh in hailo-rpi5-examples."
    fi
else
    echo "  WARNING: hailo-rpi5-examples not found at $HOME/hailo-rpi5-examples"
    echo "  Clone it from: https://github.com/hailo-ai/hailo-rpi5-examples"
fi

# Check for USB camera
echo ""
echo "Checking USB camera..."
if command -v v4l2-ctl &>/dev/null; then
    v4l2-ctl --list-devices 2>/dev/null || echo "  No camera devices found."
else
    ls /dev/video* 2>/dev/null || echo "  No /dev/video* devices found."
fi

# Check for Tailscale
echo ""
echo "Checking Tailscale..."
if command -v tailscale &>/dev/null; then
    TS_IP=$(tailscale ip -4 2>/dev/null || echo "not connected")
    echo "  Tailscale installed. IP: $TS_IP"
    TS_STATUS=$(tailscale status 2>/dev/null | head -1 || echo "unknown")
    echo "  Status: $TS_STATUS"
else
    echo "  Tailscale not installed."
    echo "  Install with: curl -fsSL https://tailscale.com/install.sh | sh"
    echo "  Then run: sudo tailscale up"
fi

echo ""
echo "=================================="
echo "  Setup complete!"
echo ""
echo "  To start remembR:"
echo "    ./run.sh"
echo ""
echo "  Or manually:"
echo "    source $HOME/hailo-rpi5-examples/setup_env.sh"
echo "    python -m src.main"
echo "=================================="
