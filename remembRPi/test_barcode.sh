#!/usr/bin/env bash
# Test barcode scanning.
#
# Usage:
#   ./test_barcode.sh camera       # open camera directly (no server needed)
#   ./test_barcode.sh camera --no-display  # headless mode
#   ./test_barcode.sh              # scan camera once via API (needs run.sh)
#   ./test_barcode.sh debug        # scan + save debug snapshot you can view
#   ./test_barcode.sh loop         # scan camera every 2 seconds
#   ./test_barcode.sh med          # test care plan with known UPC_A barcodes
#   ./test_barcode.sh barcode 049281003623   # manually submit a barcode
#
# For modes other than 'camera', the server must be running (run.sh) on localhost:8000.

HOST="${REMEMBR_HOST:-localhost}"
PORT="${REMEMBR_PORT:-8000}"
BASE="http://${HOST}:${PORT}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

pretty_json() {
    python3 -m json.tool 2>/dev/null || cat
}

check_server() {
    if ! curl -s --max-time 2 "${BASE}/health" > /dev/null 2>&1; then
        echo -e "${YELLOW}Server not reachable at ${BASE}. Is run.sh running?${NC}"
        exit 1
    fi
}

scan_once() {
    echo -e "${CYAN}--- Camera Barcode Scan (full med pipeline) ---${NC}"
    result=$(curl -s -X POST "${BASE}/scan/camera")
    echo "$result" | pretty_json
    echo ""
}

scan_debug() {
    echo -e "${CYAN}--- Debug Scan (saves snapshot + full med pipeline) ---${NC}"
    result=$(curl -s "${BASE}/scan/debug")
    echo "$result" | pretty_json

    # Extract snapshot URL and print full path
    snapshot_url=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('snapshot_url',''))" 2>/dev/null)
    if [ -n "$snapshot_url" ] && [ "$snapshot_url" != "None" ]; then
        echo ""
        echo -e "${GREEN}View snapshot:${NC} ${BASE}${snapshot_url}"
        echo -e "${GREEN}Local file:${NC}    data/snapshots/$(basename "$snapshot_url")"
    fi
    echo ""
}

# Test care plan verification with known barcodes from care_plan.json
test_med_barcodes() {
    echo -e "${CYAN}=== Testing Med Verification with Care Plan Barcodes ===${NC}"
    echo ""

    # These are UPC_A barcodes from config/care_plan.json
    declare -A MEDS
    MEDS["049281003623"]="Metformin 500mg (Morning)"
    MEDS["300651465309"]="Lisinopril 10mg (Morning)"
    MEDS["000781216131"]="Atorvastatin 20mg (Evening)"
    MEDS["312843536067"]="Aspirin 81mg (Morning)"
    MEDS["078742211282"]="Vitamin D3 2000 IU (Morning)"
    # Test a barcode NOT in the care plan
    MEDS["012345678905"]="UNKNOWN - should be mismatch"

    for barcode in "${!MEDS[@]}"; do
        expected="${MEDS[$barcode]}"
        echo -e "${YELLOW}Testing: ${barcode}${NC} (expected: ${expected})"

        # Use the /med/scan endpoint with the barcode
        result=$(curl -s -X POST "${BASE}/med/scan" \
            -H "Content-Type: application/json" \
            -d "{\"barcode\": \"${barcode}\"}")

        status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
        message=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','?'))" 2>/dev/null)

        if [ "$status" = "match" ]; then
            echo -e "  ${GREEN}MATCH${NC}: ${message}"
        elif [ "$status" = "mismatch" ]; then
            echo -e "  ${YELLOW}MISMATCH${NC}: ${message}"
        else
            echo -e "  Status: ${status} - ${message}"
        fi

        # Also do the drug lookup via the med scan with just the barcode
        echo -e "  Drug lookup:"
        drug_result=$(curl -s -X POST "${BASE}/scan/camera" \
            -H "Content-Type: application/json" 2>/dev/null)
        echo ""
    done

    echo -e "${CYAN}=== Drug Lookup (openFDA) for Care Plan Barcodes ===${NC}"
    echo ""
    # Test a few barcodes directly against openFDA via /med/scan
    for barcode in "049281003623" "312843536067" "078742211282"; do
        expected="${MEDS[$barcode]}"
        echo -e "${YELLOW}Drug lookup: ${barcode}${NC} (${expected})"
        # No direct HTTP endpoint for drug-only lookup, but we can check
        # what /scan/camera would return if it had this barcode
        echo "  (Use './test_barcode.sh barcode ${barcode}' to test against camera frame)"
        echo ""
    done
}

# Manually submit a barcode string (no camera needed)
submit_barcode() {
    local barcode="$1"
    if [ -z "$barcode" ]; then
        echo "Usage: $0 barcode <barcode_string>"
        echo "Example: $0 barcode 049281003623"
        exit 1
    fi

    echo -e "${CYAN}--- Manual Barcode Submission: ${barcode} ---${NC}"
    echo ""

    # 1. Care plan check
    echo -e "${YELLOW}Care plan verification:${NC}"
    curl -s -X POST "${BASE}/med/scan" \
        -H "Content-Type: application/json" \
        -d "{\"barcode\": \"${barcode}\"}" | pretty_json
    echo ""

    # 2. Full health check to confirm server is running
    echo -e "${YELLOW}Server status:${NC}"
    curl -s "${BASE}/health" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  Pipeline: {\"running\" if d.get(\"pipeline_running\") else \"stopped\"}')
print(f'  Objects tracked: {d.get(\"objects_tracked\", 0)}')
print(f'  Uptime: {d.get(\"uptime_seconds\", 0):.0f}s')
" 2>/dev/null
    echo ""
}

# ---- Camera mode (standalone, no server needed) ----

camera_mode() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    shift  # remove 'camera' from args
    echo -e "${CYAN}=== Standalone Barcode/QR Scanner (OpenCV + pyzbar) ===${NC}"
    echo -e "${YELLOW}No server required. Opening camera directly.${NC}"
    echo ""
    exec python3 "${SCRIPT_DIR}/scripts/test_barcode_camera.py" "$@"
}

# ---- Main ----

# 'camera' mode doesn't need the server
if [ "${1:-}" = "camera" ]; then
    camera_mode "$@"
    exit 0
fi

check_server

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
    med)
        test_med_barcodes
        ;;
    barcode)
        submit_barcode "$2"
        ;;
    *)
        echo "Usage: $0 [camera|once|debug|loop|med|barcode <code>]"
        echo ""
        echo "  camera   - Open camera directly with OpenCV (no server needed)"
        echo "  once     - Scan camera for barcodes via API (default)"
        echo "  debug    - Scan camera + save snapshot you can view"
        echo "  loop     - Scan camera every 2 seconds"
        echo "  med      - Test care plan with known UPC_A barcodes"
        echo "  barcode  - Manually submit a barcode string"
        exit 1
        ;;
esac
