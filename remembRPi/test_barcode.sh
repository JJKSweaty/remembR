#!/usr/bin/env bash
# Test barcode scanning via the remembR API.
#
# Usage:
#   ./test_barcode.sh              # scan once
#   ./test_barcode.sh loop         # scan every 2 seconds
#   ./test_barcode.sh debug        # scan + save debug snapshot
#
# The server must be running on localhost:8000.

HOST="${REMEMBR_HOST:-localhost}"
PORT="${REMEMBR_PORT:-8000}"
BASE="http://${HOST}:${PORT}"

scan_once() {
    echo "--- Scanning for barcodes via camera ---"
    result=$(curl -s -X POST "${BASE}/scan/camera")
    echo "$result" | python3 -m json.tool 2>/dev/null || echo "$result"
    echo ""
}

scan_debug() {
    echo "--- Debug scan (saves snapshot) ---"
    result=$(curl -s "${BASE}/scan/debug")
    echo "$result" | python3 -m json.tool 2>/dev/null || echo "$result"

    # Extract snapshot URL and print full path
    snapshot_url=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('snapshot_url',''))" 2>/dev/null)
    if [ -n "$snapshot_url" ]; then
        echo "View snapshot: ${BASE}${snapshot_url}"
        echo "Or on this machine: data/snapshots/$(basename "$snapshot_url")"
    fi
    echo ""
}

case "${1:-once}" in
    once)
        scan_once
        ;;
    debug)
        scan_debug
        ;;
    loop)
        echo "Scanning every 2 seconds. Press Ctrl+C to stop."
        while true; do
            scan_once
            sleep 2
        done
        ;;
    *)
        echo "Usage: $0 [once|debug|loop]"
        exit 1
        ;;
esac
