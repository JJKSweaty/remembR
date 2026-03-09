# remembR

Edge AI Memory Aid For Dementia Patients backend for Raspberry Pi 5 with Hailo-8L accelerator.

remembR is an personal AI companion for people with memory problems, using a camera detects and tracks objects in real time using a Hailo-8L NPU, maintains a memory of recently seen objects and their last known positions, and communicates with your phone app over HTTP and WebSocket via Tailscale.

## Quick Start

```bash
cd ~/Desktop/remembR
./setup.sh        # Install dependencies, check environment
./run.sh           # Start the server
```

## Features

- **Full 1080p live detection** - 1920×1080 USB webcam feed processed by Hailo-8L with YOLOv8s at 30fps
- **Object memory** - Tracks what objects were seen, when, and where (left side / center / right side etc.)
- **Missing-object search** - Ask "where is my wallet?" and get the last known location, confidence, and time since seen
- **Annotated snapshots** - When an object is found, returns a full-resolution JPEG with bounding boxes and labels drawn on it
- **Friendly label names** - COCO labels are translated to human-friendly names (e.g. `handbag` → `wallet`) in all API responses, WebSocket broadcasts, and bounding box overlays
- **Label aliases** - Fuzzy query matching: "phone", "mobile", "smartphone" all resolve to cell phone detection; "wallet", "billfold", "purse" all resolve to handbag detection
- **Per-label confidence tuning** - Smaller or harder objects (bottle, cup, remote, wallet) use lower thresholds so they aren't silently dropped; phone stays at 75%+ to avoid false positives
- **Pan-tilt sweep** - ESP32-controlled camera mount can sweep the room to find objects not currently in frame
- **Persistent memory** - Object history survives restarts via JSON persistence
- **Tailscale networking** - Stable, private, encrypted connection; both team members' devices are full tailnet members

## Hardware

- Raspberry Pi 5 (8GB)
- Hailo-8L AI HAT+ (13 TOPS)
- USB webcam at 1080p (e.g. Logitech Brio 100)
- ESP32-S3 controlling a pan-tilt servo mount

## Prerequisites

- Hailo RPi5 examples installed at `~/hailo-rpi5-examples`
- Python 3.11+
- Tailscale installed and authenticated

## Running

### Basic usage

```bash
./run.sh
```

### With options

```bash
./run.sh --port 8000                  # Custom port
./run.sh --camera /dev/video2         # Explicit camera device
./run.sh --log-level DEBUG            # Verbose logging
./run.sh --no-hailo                   # API-only mode (no detection)
./run.sh --tailscale-check            # Print connection info and exit
```

### Manual run (without run.sh)

```bash
source ~/hailo-rpi5-examples/setup_env.sh
cd ~/Desktop/remembR
export PYTHONPATH="$HOME/hailo-rpi5-examples:$(pwd)"
python3 -m src.main
```

### Monitor Hailo device

```bash
hailortcli monitor
# or
export HAILO_MONITOR=1 && ./run.sh
```

---

## Tailscale Networking

remembR uses Tailscale so the phone app can reach the Pi reliably over any network (WiFi, mobile data, different LANs) without port forwarding.

### How it works

Every device - the Pi, both team members' phones/laptops - is a **full member of one shared tailnet**. All traffic is WireGuard-encrypted. The Pi gets a stable MagicDNS hostname that never changes, even after reboots.

On startup, remembR prints all available connection URLs:

```
Preferred HTTP URL:      http://secondsight.tail12345.ts.net:8000
Preferred WebSocket URL: ws://secondsight.tail12345.ts.net:8000/ws
Fallback HTTP URL:       http://100.x.y.z:8000
Fallback WebSocket URL:  ws://100.x.y.z:8000/ws
Local LAN HTTP URL:      http://10.0.0.120:8000
```

### Adding a team member to the tailnet

Invite them at [login.tailscale.com/admin/users](https://login.tailscale.com/admin/users) → **Invite users**. They authenticate once and their device appears as a full peer in `tailscale status` on all other devices.

```bash
tailscale status
# should list Pi, your laptop, partner's laptop all as "connected"
```

### ACL policy

To restrict access so only tailnet members can reach the Pi's API port, use an ACL in the Tailscale admin console. The policy below allows all authenticated members full access

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["autogroup:member:*"]
    }
  ]
}
```

To scope it more tightly (e.g. only allow access to port 8000 on the Pi):

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["tag:remembr-pi:8000"]
    }
  ],
  "tagOwners": {
    "tag:remembr-pi": ["autogroup:owner"]
  }
}
```

Then tag the Pi device as `tag:remembr-pi` in the machines list.

### Verify connection

```bash
tailscale status
tailscale ip -4
./run.sh --tailscale-check
curl http://<tailscale-ip>:8000/health
```

---

## HTTP API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check with pipeline status |
| `/objects/current` | GET | Objects currently visible in frame |
| `/objects/recent?within=300` | GET | Objects seen recently (default 5 min) |
| `/find` | POST | Search for a missing object - returns location + annotated snapshot |
| `/snapshots/{id}` | GET | Fetch a saved snapshot JPEG |
| `/command` | POST | Commands: `status`, `clear_memory`, `force_persist` |
| `/status` | GET | Detailed system status |

### Find example

```bash
curl -X POST http://secondsight:8000/find \
  -H "Content-Type: application/json" \
  -d '{"label": "wallet"}'
```

Response:

```json
{
  "type": "find_result",
  "label": "wallet",
  "query": "wallet",
  "found_now": true,
  "last_seen_ago": "just now",
  "region": "left side",
  "confidence": 0.76,
  "snapshot_url": "/snapshots/wallet_2026-03-08_14-30-00_abc123.jpg",
  "message": "Wallet is visible right now in the left side. Detected with 76% confidence."
}
```

The `snapshot_url` points to a full 1080p JPEG with bounding boxes drawn on all currently detected objects.

---

## WebSocket Protocol

Connect to `ws://<host>:8000/ws`

### Phone → Pi

```json
{"type": "ping"}
{"type": "find", "label": "wallet"}
{"type": "get_current_objects"}
{"type": "get_recent_objects", "within": 300}
{"type": "capture_snapshot"}
{"type": "sweep"}
```

### Pi → Phone

```json
{"type": "pong", "timestamp": 1234567890.0}
{"type": "find_result", "label": "wallet", "found_now": true, "region": "center area", "snapshot_url": "/snapshots/...", ...}
{"type": "objects_update", "objects": [...], "timestamp": 1234567890.0}
{"type": "snapshot_ready", "snapshot_id": "manual_2026-03-08_14-30-00_abc123.jpg", "url": "/snapshots/..."}
{"type": "error", "message": "..."}
```

Real-time `objects_update` messages are pushed automatically whenever the detection pipeline processes a new frame with confirmed objects. All labels in these messages use the friendly display names (e.g. `"wallet"` not `"handbag"`).

See `docs/mobile_protocol.md` for the full message schema.

---

## Architecture

```
USB Camera (1080p)
       |
[GStreamer + Hailo-8L YOLOv8s]   <-- hardware inference, ~30fps
       |
 [Pad Probe Callback]             <-- lightweight: extract detections + frame
       |
 [Thread-Safe Queue]              <-- producer-consumer bridge
       |
 [Memory Worker Thread]           <-- all heavy work happens here
       |
   +---+-------------------+
   |                       |
[ObjectMemoryManager]  [WebSocket Broadcast]  --> phone app
   |                       |
[JSON Persistence]    [on_detections callback]
   |
[MissingFinder]              <-- label alias resolution + response formatting
   |
[FastAPI HTTP + WS]          <-- exposed over Tailscale
```

The GStreamer/Hailo callback is kept deliberately minimal - it only extracts detection structs and the raw frame into a queue. All memory updates, snapshot saving, label translation, and WebSocket messaging happen in the separate memory worker thread.

See `docs/architecture.md` for full design documentation.

---

## Object Detection

### Model

YOLOv8s compiled for Hailo-8L (`yolov8s_h8l.hef`). This is the largest COCO detection model available for the Hailo-8L hardware - yolov8m only exists for the higher-end Hailo-10.

### Detected object classes

The system filters detections to a relevant subset of COCO classes:

`bottle`, `cup`, `cell phone`, `backpack`, `remote`, `book`, `keyboard`, `mouse`, `wallet` (handbag), `laptop`, `umbrella`, `scissors`, `clock`, `tv`, `chair`, `bowl`, `vase`

### Confidence thresholds

| Label | Threshold | Reason |
|---|---|---|
| cell phone | 0.75 (default) | High bar to avoid false positives |
| cup | 0.50 | Varied shapes/sizes |
| remote | 0.50 | Small, often partially occluded |
| bottle | 0.45 | Many different bottle types |
| wallet (handbag) | 0.40 | Small object, COCO class mismatch |
| all others | 0.75 | Default |

### Label aliases

User queries are resolved to the closest COCO class:

| User says | Detects as |
|---|---|
| wallet, billfold, purse | wallet (handbag) |
| phone, mobile, smartphone | cell phone |
| mug, glass, tumbler | cup |
| controller, clicker | remote |
| monitor, screen | tv |
| bag, rucksack | backpack |

### Known limitations

- Detects **object classes**, not unique instances - cannot distinguish your wallet from someone else's
- COCO has no wallet class; wallet detections use the `handbag` class internally but display as `wallet` in all outputs
- Small objects or unusual lighting/angles may be missed or have low confidence
- Temporal debounce (3 hits in 5 frames) filters flickering detections but adds a small lag to first detection

---

## Configuration

All tunable settings are in `config/app_config.yaml`. Key sections:

- `camera` — resolution (currently 1920×1080), device auto-detection
- `hailo` — model, NMS thresholds
- `detection` — allowed labels, per-label confidence, debounce window, min bbox area
- `memory` — persistence path, history limits, stale thresholds
- `snapshots` — save directory, JPEG quality, retention policy
- `esp32` — pan-tilt controller IP and port

Label aliases and display name overrides (e.g. `handbag` → `wallet`) are in `config/labels.yaml`.

---

## Project Structure

```
remembR/
  src/
    main.py                    # Entry point
    camera/
      usb_camera_detect.py     # USB webcam auto-discovery
      camera_utils.py          # Fallback single-frame capture
    hailo/
      callback_handlers.py     # GStreamer pad probe callback
      hailo_detection_app.py   # Pipeline builder + thread management
      hailo_runner.py          # Orchestrator (pipeline + memory worker)
    memory/
      object_memory.py         # ObjectMemoryManager + DetectionRecord
      persistence.py           # JSON disk persistence
      region_mapper.py         # Bbox-to-region mapping (3×3 grid)
      missing_finder.py        # Missing object search + alias resolution
    transport/
      websocket_manager.py     # WebSocket connection manager
      message_router.py        # Message type dispatcher
      tailscale_utils.py       # Tailscale detection + URL printing
    api/
      app.py                   # FastAPI app factory + WebSocket handlers
      routes.py                # HTTP route handlers
      schemas.py               # Pydantic request/response models
    utils/
      logging_utils.py         # Centralized logging setup
      time_utils.py            # Timestamp helpers
      drawing_utils.py         # Bounding box annotation (resolution-aware)
  config/
    app_config.yaml            # Main configuration
    labels.yaml                # Aliases, display names, snapshot priorities
  data/
    memory_store.json          # Persisted object memory (survives restarts)
    snapshots/                 # Annotated JPEG snapshots
    logs/                      # Application logs
  docs/
    architecture.md            # System design documentation
    mobile_protocol.md         # Phone app WebSocket message schema
    tailscale_setup.md         # Tailscale setup and troubleshooting guide
    troubleshooting.md         # Common issues and fixes
```

---

## Troubleshooting

### Find USB camera device

```bash
v4l2-ctl --list-devices
ls -la /dev/video*
```

Look for the USB device (e.g. Logitech Brio 100), not the RPi ISP `/dev/video20+` entries.

### Video is choppy or resolution is wrong

- Verify the camera supports 1920×1080 (`v4l2-ctl --list-formats-ext`)
- Lower resolution in `config/app_config.yaml` to 1280×720 if needed
- Check CPU load with `htop`

### Phone app cannot connect

1. Check `tailscale status` - both devices must show as connected
2. Try `ping <tailscale-ip>` from the phone
3. Check remembR is running: `curl http://<tailscale-ip>:8000/health`
4. Use the fallback Tailscale IP if MagicDNS doesn't resolve
5. Ensure both devices are **full tailnet members**, not just share recipients

### Object not being detected

- Check `curl http://localhost:8000/objects/current` to see what the pipeline sees
- Lower the confidence threshold for that label in `config/app_config.yaml`
- Improve lighting - Hailo detection degrades significantly in low light
- Move the object closer to the center of the frame

### Activate Hailo environment manually

```bash
cd ~/hailo-rpi5-examples
source setup_env.sh
```

---

## Credits

- Detection pipeline based on [Hailo RPi5 Examples](https://github.com/hailo-ai/hailo-rpi5-examples)
- Object memory workflow inspired by SecondSight
- Networking via [Tailscale](https://tailscale.com)
