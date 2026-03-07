# remembR

Edge AI missing-object finder backend for Raspberry Pi 5 with Hailo-8 accelerator.

remembR watches a room through a USB camera, detects and tracks objects in real time using Hailo, maintains a memory of recently seen objects and their last known positions, and communicates with your phone app over HTTP and WebSocket via Tailscale.

## Quick Start

```bash
cd ~/Desktop/remembR
./setup.sh        # Install dependencies, check environment
./run.sh           # Start the server
```

## What It Does

1. **Live detection** - USB webcam feed processed by Hailo-8 with YOLOv8s object detection
2. **Object memory** - Tracks what objects were seen, when, and where in the frame
3. **Missing-object search** - Phone app asks "where is my wallet?" and gets a meaningful answer
4. **Snapshot capture** - Returns annotated photos showing where objects were detected
5. **Tailscale networking** - Stable, private connection between your phone and the Pi

## Prerequisites

- Raspberry Pi 5 with Hailo-8/8L AI HAT+
- USB webcam (e.g., Logitech Brio 100)
- Hailo RPi5 examples installed at `~/hailo-rpi5-examples`
- Python 3.11+
- Tailscale (recommended for phone access)

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

## Connecting From Your Phone

The phone app should connect using the Pi's Tailscale hostname (preferred) or IP.

On startup, remembR prints connection URLs:

```
Preferred HTTP URL:      http://secondsight.tail12345.ts.net:8000
Preferred WebSocket URL: ws://secondsight.tail12345.ts.net:8000/ws
Fallback HTTP URL:       http://100.x.y.z:8000
Fallback WebSocket URL:  ws://100.x.y.z:8000/ws
Local LAN HTTP URL:      http://10.0.0.120:8000
```

Use the **Tailscale hostname** as the primary address. It stays stable even if the Pi restarts.

## HTTP API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check with pipeline status |
| `/objects/current` | GET | Objects currently visible |
| `/objects/recent?within=300` | GET | Objects seen recently (default 5 min) |
| `/find` | POST | Search for a missing object |
| `/snapshots/{id}` | GET | Serve a saved snapshot image |
| `/command` | POST | Generic commands (status, clear_memory, force_persist) |
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
  "label": "handbag",
  "query": "wallet",
  "found_now": false,
  "last_seen_ago": "2 minutes ago",
  "region": "left side",
  "confidence": 0.82,
  "message": "I last saw wallet 2 minutes ago in the left side. It's not visible right now, but was detected with 82% confidence."
}
```

## WebSocket Protocol

Connect to `ws://<host>:8000/ws`

### Phone sends (inbound)

```json
{"type": "ping"}
{"type": "find", "label": "wallet"}
{"type": "get_current_objects"}
{"type": "capture_snapshot"}
```

### Pi sends (outbound)

```json
{"type": "pong", "timestamp": 1234567890.0}
{"type": "find_result", "label": "handbag", "found_now": true, "region": "center area", ...}
{"type": "objects_update", "objects": [...], "timestamp": 1234567890.0}
{"type": "snapshot_ready", "snapshot_id": "wallet_2026-03-07_14-30-00_abc123.jpg", "url": "/snapshots/..."}
{"type": "error", "message": "..."}
```

See `docs/mobile_protocol.md` for the full schema.

## Architecture

```
USB Camera --> [GStreamer Pipeline + Hailo-8 Inference]
                          |
                    [Pad Probe Callback]  (lightweight: extract detections)
                          |
                  [Thread-Safe Queue]     (producer-consumer bridge)
                          |
                  [Memory Worker Thread]  (heavy processing here)
                          |
              +-----------+-----------+
              |                       |
     [ObjectMemoryManager]    [WebSocket Broadcast]
              |                       |
     [JSON Persistence]        [Phone App Client]
              |
     [MissingFinder]
```

The Hailo callback stays fast. All memory updates, snapshot saving, and WebSocket messaging happen in the memory worker thread.

See `docs/architecture.md` for detailed design documentation.

## Project Structure

```
remembR/
  src/
    main.py                    # Entry point
    camera/
      usb_camera_detect.py     # USB webcam discovery
      camera_utils.py          # Frame capture helpers
    hailo/
      callback_handlers.py     # GStreamer pad probe callback
      hailo_detection_app.py   # Pipeline builder
      hailo_runner.py          # Orchestrator (pipeline + worker)
    memory/
      object_memory.py         # ObjectMemoryManager
      persistence.py           # JSON disk persistence
      region_mapper.py         # Bbox-to-region mapping
      missing_finder.py        # Missing object search
    transport/
      websocket_manager.py     # WebSocket connection manager
      message_router.py        # Message type dispatcher
      tailscale_utils.py       # Tailscale detection utilities
    api/
      app.py                   # FastAPI app factory
      routes.py                # HTTP route handlers
      schemas.py               # Pydantic data models
    utils/
      logging_utils.py         # Centralized logging
      time_utils.py            # Timestamp helpers
      drawing_utils.py         # Bbox annotation drawing
  config/
    app_config.yaml            # Main configuration
    labels.yaml                # Label aliases for fuzzy matching
  data/
    memory_store.json          # Persisted object memory
    snapshots/                 # Saved snapshot images
    logs/                      # Application logs
  docs/
    architecture.md            # System design documentation
    mobile_protocol.md         # Phone app message schema
    tailscale_setup.md         # Tailscale networking guide
    troubleshooting.md         # Common issues and fixes
```

## Troubleshooting

### Find USB camera device

```bash
v4l2-ctl --list-devices
# or
ls -la /dev/video*
```

Look for the USB device (e.g., Logitech Brio 100), not the RPi ISP `/dev/video20+` entries.

### Activate Hailo environment

```bash
cd ~/hailo-rpi5-examples
source setup_env.sh
```

### Test base Hailo detection separately

```bash
cd ~/hailo-rpi5-examples
source setup_env.sh
python basic_pipelines/detection.py --input /dev/video0
```

### Video is choppy

- Lower resolution in `config/app_config.yaml` (try 640x480)
- Check CPU load with `htop`
- Ensure heavy processing is not in the callback (it shouldn't be with remembR's design)

### Monitor Hailo device

```bash
hailortcli monitor
# or set environment variable before running:
export HAILO_MONITOR=1
./run.sh
```

### Check CPU load

```bash
htop
```

### Verify Tailscale connection

```bash
tailscale status
tailscale ip -4
./run.sh --tailscale-check
```

### Phone app cannot connect

1. Verify both phone and Pi are on the same Tailscale tailnet
2. Check `tailscale status` shows both devices
3. Try pinging the Pi from the phone: `ping <tailscale-ip>`
4. Verify the port is correct (default 8000)
5. Try the fallback IP if hostname doesn't resolve

See `docs/troubleshooting.md` for more.

## Object Detection Limitations

remembR uses COCO-trained YOLOv8s for object detection. This means:

- It detects **object classes** (e.g., "cup", "cell phone"), not unique instances
- It cannot distinguish YOUR wallet from any other wallet
- "Wallet" is not a COCO class; queries for "wallet" are mapped to "handbag"
- Detection confidence and consistency depend on lighting, angle, and object size
- Small objects or unusual orientations may be missed

The system is honest about these limitations in its responses.

## Credits

- Detection pipeline based on [Hailo RPi5 Examples](https://github.com/hailo-ai/hailo-rpi5-examples)
- Object memory and missing-item workflow inspired by SecondSight
- Hailo Apps infrastructure for GStreamer integration
