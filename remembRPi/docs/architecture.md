# remembR Architecture

## System Overview

remembR is an edge AI backend that runs on a Raspberry Pi 5 with a Hailo-8 accelerator. It processes a live USB camera feed to detect household objects, maintains a memory of what was seen and where, and provides this information to a phone app over HTTP and WebSocket.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Raspberry Pi 5                          │
│                                                              │
│  ┌──────────┐    ┌─────────────────────────────────────┐    │
│  │ USB      │    │ GStreamer Pipeline                   │    │
│  │ Webcam   │───>│ v4l2src -> decode -> hailonet ->     │    │
│  │          │    │ hailofilter -> hailotracker ->       │    │
│  └──────────┘    │ identity_callback -> hailooverlay    │    │
│                  └──────────┬──────────────────────────┘    │
│                             │                                │
│                    [Pad Probe Callback]                       │
│                    (extracts detections,                      │
│                     puts in queue)                            │
│                             │                                │
│                  ┌──────────▼──────────┐                     │
│                  │  Thread-Safe Queue   │                     │
│                  │  (max 30 items)      │                     │
│                  └──────────┬──────────┘                     │
│                             │                                │
│                  ┌──────────▼──────────┐                     │
│                  │  Memory Worker      │                     │
│                  │  Thread             │                     │
│                  │  - filter detections│                     │
│                  │  - update memory    │                     │
│                  │  - map regions      │                     │
│                  │  - trigger events   │                     │
│                  └──────┬────┬────────┘                     │
│                         │    │                               │
│              ┌──────────┘    └──────────┐                    │
│              │                          │                    │
│   ┌──────────▼──────────┐   ┌──────────▼──────────┐        │
│   │ ObjectMemoryManager │   │ WebSocket Broadcast  │        │
│   │ - current objects   │   │ - objects_update     │        │
│   │ - history           │   │ - find_result        │        │
│   │ - regions           │   │ - snapshot_ready     │        │
│   └──────────┬──────────┘   └──────────┬──────────┘        │
│              │                          │                    │
│   ┌──────────▼──────────┐   ┌──────────▼──────────┐        │
│   │ JSON Persistence    │   │ FastAPI HTTP Server  │        │
│   │ (every 30s)         │   │ /health              │        │
│   │ data/memory_store   │   │ /objects/current     │        │
│   └─────────────────────┘   │ /find                │        │
│                             │ /snapshots/:id       │        │
│                             │ /ws (WebSocket)      │        │
│                             └──────────┬──────────┘        │
│                                        │                    │
│                             ┌──────────▼──────────┐        │
│                             │ Tailscale Interface  │        │
│                             │ (0.0.0.0:8000)       │        │
│                             └──────────┬──────────┘        │
│                                        │                    │
└────────────────────────────────────────┼────────────────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Phone App (client)   │
                              │ - HTTP requests      │
                              │ - WebSocket messages  │
                              │ via Tailscale         │
                              └─────────────────────┘
```

## Design Decisions

### 1. Producer-Consumer Pattern

The Hailo GStreamer pipeline runs its own GLib main loop. The pad probe callback fires on every frame and must return quickly to avoid blocking the pipeline. Heavy work (memory updates, persistence, WebSocket broadcasts) must happen elsewhere.

**Solution:** A thread-safe `queue.Queue` bridges the callback (producer) and a dedicated memory worker thread (consumer). The queue has a max size of 30 items; if full, the oldest item is dropped to maintain freshness.

### 2. Hailo Pipeline Integration

Rather than building custom inference code, remembR uses the `hailo-apps-infra` framework (via `hailo-rpi5-examples`):

- `GStreamerDetectionApp` builds the full GStreamer pipeline including source, inference, tracker, and display elements
- The pipeline includes `hailotracker` for short-term object tracking (provides track IDs)
- Pipeline construction is parameterized via CLI args (`--input`, `--use-frame`, etc.)
- The `identity` element named `identity_callback` is where our pad probe is attached

This approach is preferred because the Hailo examples are optimized for the RPi5 hardware and handle pipeline construction, NMS, format conversion, and display correctly.

### 3. Object Memory Model

Objects are tracked by **label** (class name), not by unique instance identity. This is an honest limitation of COCO-trained detection models - they can identify "a cup" but not "your specific blue mug."

Each `ObjectRecord` stores:
- First/last seen timestamps
- Best and latest confidence scores
- Latest region (from grid-based region mapping)
- Bounded history of recent sightings
- Temporal debounce state

### 4. Region Mapping

A 3x3 grid divides the camera frame into zones: "upper-left area", "center area", "lower-right area", etc. The bbox center point determines which zone an object falls in. This is simple but effective for answering "where in the room is it?"

### 5. Label Alias Resolution

COCO labels don't always match what users say. The `MissingFinder` resolves aliases:
- "phone" -> "cell phone"
- "wallet" -> "handbag" (COCO has no wallet class)
- "mug" -> "cup"

Aliases are configurable in `config/labels.yaml`.

### 6. Persistence

Object memory is serialized to `data/memory_store.json` every 30 seconds via an atomic write (temp file + rename). On startup, the store is loaded to restore previous session context. This means if the Pi reboots, the app remembers what it saw before.

### 7. Networking via Tailscale

The backend binds to `0.0.0.0:8000` making it reachable from any network interface. Tailscale provides a stable, private, encrypted connection:
- No port forwarding needed
- No dynamic DNS needed
- MagicDNS hostname stays the same across reboots
- Only devices on the same tailnet can connect

## Thread Model

| Thread | Purpose | Blocking? |
|--------|---------|-----------|
| Main (asyncio) | FastAPI HTTP + WebSocket server | Event loop |
| GStreamer | GLib main loop for detection pipeline | GLib loop |
| Memory Worker | Consumes detection queue, updates memory | Queue.get() |
| Persistence | Periodic save to disk | time.sleep() |

All threads except Main are daemon threads and exit when the main process exits.

## Data Flow for "Find My Wallet"

1. Phone app sends `{"type": "find", "label": "wallet"}` via WebSocket
2. `MessageRouter` dispatches to the `find` handler
3. `MissingFinder.resolve_label("wallet")` -> "handbag" (alias)
4. `MissingFinder.find("wallet")` queries `ObjectMemoryManager`
5. If "handbag" record exists and was seen 2 minutes ago:
   - Response: `{"type": "find_result", "found_now": false, "last_seen_ago": "2 minutes ago", "region": "left side", "message": "I last saw wallet 2 minutes ago in the left side..."}`
6. If currently visible:
   - Latest frame is saved as a snapshot
   - Response includes `snapshot_url` pointing to the image
7. Response sent back to the phone via WebSocket
