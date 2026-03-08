# remembR API Reference

> **Base URL**: `http://<pi-tailscale-hostname>:8000`
> **WebSocket**: `ws://<pi-tailscale-hostname>:8000/ws`
>
> Replace `<pi-tailscale-hostname>` with the Pi's Tailscale MagicDNS name (e.g., `remembr-pi.tail1234.ts.net`) or its Tailscale IP (e.g., `100.x.y.z`).

---

## Connection Setup

1. Both devices must be on the same Tailscale tailnet
2. Pi runs the server on port 8000
3. Phone/laptop connects via Tailscale hostname or IP
4. All traffic is encrypted by Tailscale (no HTTPS needed)

---

## HTTP Endpoints

### Health & Status

#### `GET /health`
Quick health check.

**Response:**
```json
{
  "status": "ok",
  "pipeline_running": true,
  "objects_tracked": 12,
  "websocket_clients": 1,
  "tailscale_connected": true,
  "tailscale_ip": "100.64.0.5",
  "tailscale_hostname": "remembr-pi.tail1234.ts.net",
  "uptime_seconds": 3600.0
}
```

#### `GET /status`
Full system status including all services.

**Response:**
```json
{
  "server": {
    "hostname": "remembr-pi",
    "uptime_seconds": 3600.0,
    "port": 8000
  },
  "tailscale": {
    "installed": true,
    "connected": true,
    "ip": "100.64.0.5",
    "hostname": "remembr-pi.tail1234.ts.net"
  },
  "camera": {
    "device": "/dev/video0",
    "pipeline_running": true
  },
  "hailo": {
    "available": true,
    "pipeline_running": true
  },
  "memory": {
    "total_objects": 12,
    "currently_visible": 3,
    "recently_seen": 8
  },
  "pan_tilt": {
    "available": true,
    "base_url": "http://192.168.1.135:8080",
    "sweeping": false,
    "last_sweep_time": null
  },
  "barcode": {
    "available": false,
    "device": null,
    "last_barcode": null,
    "last_scan_time": null
  },
  "care_plan": {
    "loaded": true,
    "medication_count": 5,
    "barcode_count": 10
  },
  "lidar": {
    "available": false,
    "port": "/dev/ttyAMA0",
    "distance_m": null,
    "last_read_time": null
  },
  "companion": {
    "available": true,
    "current_state": "idle"
  }
}
```

---

### Object Finding

#### `GET /objects/current`
Get objects the camera can see right now.

**Response:**
```json
{
  "objects": [
    {
      "label": "cell phone",
      "confidence": 0.87,
      "region": "center area",
      "visible_now": true,
      "last_seen": 1709827200.0,
      "last_seen_iso": "2026-03-07T12:00:00+00:00",
      "last_seen_ago": "just now",
      "track_id": 3,
      "bbox": { "x": 0.35, "y": 0.42, "w": 0.12, "h": 0.08 },
      "total_seen_count": 145
    }
  ],
  "count": 1,
  "timestamp": 1709827200.0
}
```

#### `GET /objects/recent?within=300`
Get objects seen within the last N seconds (default 300 = 5 min).

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `within` | float | 300 | Seconds to look back |

**Response:** Same shape as `/objects/current`.

#### `POST /find`
Search for a specific object by name. Supports aliases (e.g., "wallet" -> "handbag", "phone" -> "cell phone").

**Request body:**
```json
{
  "label": "wallet",
  "sweep": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | yes | Object to find (e.g., "wallet", "keys", "phone", "remote", "glasses") |
| `sweep` | bool | no | If `true`, triggers a pan-tilt room sweep before searching (default `false`) |

**Response (found now):**
```json
{
  "type": "find_result",
  "label": "handbag",
  "query": "wallet",
  "found_now": true,
  "last_seen": 1709827200.0,
  "last_seen_iso": "2026-03-07T12:00:00+00:00",
  "last_seen_ago": "just now",
  "region": "left side",
  "confidence": 0.91,
  "track_id": 5,
  "snapshot_url": "/snapshots/wallet_2026-03-07_12-00-00_a1b2c3.jpg",
  "distance_m": 1.5,
  "distance_text": "about 1.5 meters away",
  "message": "Wallet is visible right now in the left side. Detected with 91% confidence."
}
```

**Response (last seen):**
```json
{
  "type": "find_result",
  "label": "remote",
  "query": "remote",
  "found_now": false,
  "last_seen": 1709826900.0,
  "last_seen_iso": "2026-03-07T11:55:00+00:00",
  "last_seen_ago": "5 minutes ago",
  "region": "lower-right area",
  "confidence": 0.85,
  "track_id": 2,
  "snapshot_url": null,
  "distance_m": null,
  "distance_text": null,
  "message": "I last saw remote 5 minutes ago in the lower-right area. It's not visible right now, but was detected with 85% confidence."
}
```

**Response (not found):**
```json
{
  "type": "find_result",
  "label": "keys",
  "query": "keys",
  "found_now": false,
  "last_seen": null,
  "last_seen_iso": null,
  "last_seen_ago": null,
  "region": null,
  "confidence": null,
  "track_id": null,
  "snapshot_url": null,
  "distance_m": null,
  "distance_text": null,
  "message": "I haven't seen keys in my memory. It may not have been in view of the camera."
}
```

---

### Medication Verification

**SAFETY**: These endpoints NEVER diagnose, prescribe, or tell the user to take or skip medication. They only compare against a preloaded care plan.

#### `POST /med/scan`
Verify a medication barcode or name against the care plan.

**Request body (barcode):**
```json
{
  "barcode": "049281003623"
}
```

**Request body (name):**
```json
{
  "medication_name": "Metformin"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `barcode` | string | no* | Scanned barcode string |
| `medication_name` | string | no* | Medication name for name-based lookup |

*At least one of `barcode` or `medication_name` must be provided.

**Response (match):**
```json
{
  "type": "med_scan_result",
  "status": "match",
  "barcode": "049281003623",
  "medication_name": "Metformin",
  "dosage": "500mg",
  "plan_slot": "Morning",
  "confidence": 0.95,
  "safety_notice": "Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician.",
  "message": "This barcode matches Metformin (500mg) in your care plan, scheduled for Morning. Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician."
}
```

**Response (mismatch):**
```json
{
  "type": "med_scan_result",
  "status": "mismatch",
  "barcode": "999999999999",
  "medication_name": null,
  "dosage": null,
  "plan_slot": null,
  "confidence": 0.0,
  "safety_notice": "Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician.",
  "message": "This barcode does not appear in the current medication plan. Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician."
}
```

**Response (uncertain):**
```json
{
  "type": "med_scan_result",
  "status": "uncertain",
  "barcode": null,
  "medication_name": null,
  "dosage": null,
  "plan_slot": null,
  "confidence": 0.0,
  "safety_notice": "Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician.",
  "message": "No care plan is loaded. I cannot verify this medication. Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician."
}
```

#### `GET /med/plan`
Get the current care plan summary.

**Response:**
```json
{
  "loaded": true,
  "medication_count": 5,
  "medications": [
    {
      "name": "Metformin",
      "dosage": "500mg",
      "schedule": "Morning"
    },
    {
      "name": "Lisinopril",
      "dosage": "10mg",
      "schedule": "Morning"
    },
    {
      "name": "Atorvastatin",
      "dosage": "20mg",
      "schedule": "Evening"
    },
    {
      "name": "Aspirin",
      "dosage": "81mg",
      "schedule": "Morning"
    },
    {
      "name": "Vitamin D3",
      "dosage": "2000 IU",
      "schedule": "Morning"
    }
  ]
}
```

---

### Pan-Tilt Control

#### `POST /pantilt/sweep`
Trigger a full room sweep (pan left-to-right with tilt at each position). Takes ~30 seconds.

**Request body:** None (empty POST).

**Response:**
```json
{
  "status": "ok",
  "message": "Sweep complete",
  "duration_seconds": 28.5
}
```

**Error responses:**
```json
{ "status": "unavailable", "message": "Pan-tilt controller not connected" }
{ "status": "busy", "message": "Sweep already in progress" }
{ "status": "timeout", "message": "Sweep timed out" }
```

#### `POST /pantilt/center`
Center both servos.

**Response:**
```json
{ "status": "ok", "message": "Centered" }
```

#### `POST /pantilt/move`
Move to specific servo positions.

**Request body:**
```json
{
  "pan_us": 1520,
  "tilt_us": 1200
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `pan_us` | int | 520-2520 | Pan position in microseconds (520=left, 1520=center, 2520=right) |
| `tilt_us` | int | 200-1700 | Tilt position in microseconds (200=down, 950=center, 1700=up) |

Both fields are optional; only the provided ones will be set.

---

### Snapshots

#### `GET /snapshots/{snapshot_id}`
Serve a saved snapshot JPEG image.

**Example:** `GET /snapshots/wallet_2026-03-07_12-00-00_a1b2c3.jpg`

**Response:** JPEG image (content-type: image/jpeg).

---

### Generic Commands

#### `POST /command`
Generic command endpoint.

**Request body:**
```json
{ "command": "status" }
```

| Command | Description |
|---------|-------------|
| `status` | Returns object counts |
| `clear_memory` | Clears all object memory |
| `force_persist` | Forces memory save to disk |

---

## WebSocket Protocol

Connect to `ws://<pi-tailscale-hostname>:8000/ws`

All messages are JSON. Every message has a `type` field.

### Phone -> Pi (you send these)

#### `ping`
```json
{ "type": "ping" }
```

#### `find_object` (or `find`)
```json
{
  "type": "find_object",
  "label": "wallet"
}
```

#### `get_current_objects`
```json
{ "type": "get_current_objects" }
```

#### `get_recent_objects`
```json
{
  "type": "get_recent_objects",
  "within": 300
}
```

#### `capture_snapshot`
```json
{ "type": "capture_snapshot" }
```

#### `start_med_scan`
```json
{
  "type": "start_med_scan",
  "barcode": "049281003623"
}
```
or:
```json
{
  "type": "start_med_scan",
  "medication_name": "Metformin"
}
```

#### `sweep`
```json
{ "type": "sweep" }
```

---

### Pi -> Phone (you receive these)

#### `pong`
```json
{ "type": "pong", "timestamp": 1709827200.0 }
```

#### `objects_update`
Pushed automatically when detections change, or in response to `get_current_objects`.
```json
{
  "type": "objects_update",
  "objects": [
    {
      "label": "cell phone",
      "confidence": 0.87,
      "bbox": { "x": 0.35, "y": 0.42, "w": 0.12, "h": 0.08 },
      "track_id": 3,
      "timestamp": 1709827200.0
    }
  ],
  "timestamp": 1709827200.0
}
```

#### `recent_objects`
Response to `get_recent_objects`.
```json
{
  "type": "recent_objects",
  "objects": [ ... ],
  "within_seconds": 300,
  "timestamp": 1709827200.0
}
```

#### `find_result`
Response to `find_object`.
```json
{
  "type": "find_result",
  "label": "handbag",
  "query": "wallet",
  "found_now": true,
  "last_seen": 1709827200.0,
  "last_seen_iso": "2026-03-07T12:00:00+00:00",
  "last_seen_ago": "just now",
  "region": "left side",
  "confidence": 0.91,
  "track_id": 5,
  "snapshot_url": "/snapshots/wallet_2026-03-07_12-00-00_a1b2c3.jpg",
  "message": "Wallet is visible right now in the left side. Detected with 91% confidence."
}
```

#### `snapshot_ready`
Response to `capture_snapshot`.
```json
{
  "type": "snapshot_ready",
  "snapshot_id": "manual_2026-03-07_12-00-00_a1b2c3.jpg",
  "url": "/snapshots/manual_2026-03-07_12-00-00_a1b2c3.jpg",
  "timestamp": 1709827200.0
}
```

#### `med_scan_result`
Response to `start_med_scan`.
```json
{
  "type": "med_scan_result",
  "status": "match",
  "barcode": "049281003623",
  "medication_name": "Metformin",
  "dosage": "500mg",
  "plan_slot": "Morning",
  "confidence": 0.95,
  "safety_notice": "Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician.",
  "message": "This barcode matches Metformin (500mg) in your care plan, scheduled for Morning. Please confirm the bottle label before use. If unsure, check with your caregiver, pharmacist, or clinician."
}
```

#### `sweep_result`
Response to `sweep`.
```json
{
  "type": "sweep_result",
  "status": "ok",
  "message": "Sweep complete",
  "duration_seconds": 28.5
}
```

#### `error`
```json
{
  "type": "error",
  "message": "Description of what went wrong",
  "timestamp": 1709827200.0
}
```

---

## Complete Message Type Table

### Phone -> Pi

| Message Type | Required Fields | Optional Fields | Description |
|-------------|----------------|-----------------|-------------|
| `ping` | (none) | | Keepalive ping |
| `find_object` | `label` | | Search for a missing object |
| `find` | `label` | | Alias for `find_object` |
| `get_current_objects` | (none) | | Get currently visible objects |
| `get_recent_objects` | (none) | `within` (seconds, default 300) | Get recently seen objects |
| `capture_snapshot` | (none) | | Take a camera snapshot |
| `start_med_scan` | (one of: `barcode`, `medication_name`) | | Verify medication against care plan |
| `sweep` | (none) | | Trigger pan-tilt room sweep |

### Pi -> Phone

| Message Type | Key Fields | Description |
|-------------|-----------|-------------|
| `pong` | `timestamp` | Response to ping |
| `objects_update` | `objects[]`, `timestamp` | Current detections (pushed or on request) |
| `recent_objects` | `objects[]`, `within_seconds`, `timestamp` | Recently seen objects |
| `find_result` | `label`, `query`, `found_now`, `region`, `confidence`, `message` | Object search result |
| `snapshot_ready` | `snapshot_id`, `url`, `timestamp` | Snapshot captured |
| `med_scan_result` | `status`, `medication_name`, `confidence`, `safety_notice`, `message` | Medication verification result |
| `sweep_result` | `status`, `message`, `duration_seconds` | Sweep completion result |
| `error` | `message` | Error notification |

---

## Typical Phone App Flows

### Flow 1: "Where is my wallet?"

```
Phone                          Pi
  |                             |
  |-- WS: find_object ---------->|
  |   {"type":"find_object",    |
  |    "label":"wallet"}        |
  |                             |-- searches memory
  |                             |-- captures snapshot if found
  |<--- WS: find_result -------|
  |  {"found_now":true,         |
  |   "region":"left side",     |
  |   "snapshot_url":"/snap.."} |
  |                             |
  |-- GET /snapshots/snap.. --->|  (fetch the image)
  |<--- JPEG image ------------|
```

### Flow 2: "Find with room sweep"

```
Phone                          Pi                    ESP32
  |                             |                      |
  |-- POST /find -------------->|                      |
  |   {"label":"keys",          |                      |
  |    "sweep":true}            |                      |
  |                             |-- POST /sweep ------>|
  |                             |   (sweeps room)      |
  |                             |<-- "OK" -------------|
  |                             |-- searches memory    |
  |<--- find_result ------------|                      |
```

### Flow 3: "Scan this medication"

```
Phone                          Pi
  |                             |
  |-- WS: start_med_scan ------>|
  |   {"type":"start_med_scan", |
  |    "barcode":"049281003623"}|
  |                             |-- looks up care plan
  |<--- WS: med_scan_result ---|
  |  {"status":"match",         |
  |   "medication_name":        |
  |     "Metformin",            |
  |   "safety_notice":"..."}    |
```

### Flow 4: Real-time object tracking

```
Phone                          Pi
  |                             |
  |-- WS: connect ------------->|
  |                             |
  |<--- WS: objects_update -----|  (automatic, pushed every few seconds)
  |  {"objects":[               |
  |    {"label":"cell phone",   |
  |     "confidence":0.87,      |
  |     "bbox":{...}},          |
  |    {"label":"cup",...}      |
  |  ]}                         |
  |                             |
  |<--- WS: objects_update -----|  (pushed again when detections change)
```

---

## ESP32 Pan-Tilt Endpoints (direct, port 8080)

These are exposed by the ESP32 directly, NOT through the Pi. The Pi proxies sweep/center/move commands through its own API. You normally don't call these directly.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sweep` | POST | Full room sweep |
| `/center` | POST | Center servos |
| `/pan?us=<value>` | POST | Set pan (520-2520 us) |
| `/tilt?us=<value>` | POST | Set tilt (200-1700 us) |
| `/status` | GET | Device status JSON |

---

## Tailscale Setup

### Joining the tailnet

On the Pi:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

On your phone/laptop: install the Tailscale app and log in with the same account.

### Finding the Pi's address

After joining, the Pi's address appears as:
- MagicDNS: `remembr-pi.tail1234.ts.net`
- IP: `100.x.y.z`

The Pi logs both URLs on startup.

### ACL (Access Control)

In the Tailscale admin console, add an ACL like:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["group:team"],
      "dst": ["tag:remembr-pi:8000"]
    }
  ],
  "tagOwners": {
    "tag:remembr-pi": ["group:team"]
  },
  "groups": {
    "group:team": ["user1@example.com", "user2@example.com"]
  }
}
```

This restricts port 8000 on the Pi to team members only.

### Tailscale Serve (private service)

To make the Pi accessible by its hostname on port 443 (HTTPS) over Tailscale:
```bash
sudo tailscale serve --bg 8000
```

Now teammates can reach it at `https://remembr-pi.tail1234.ts.net` (HTTPS, port 443) over Tailscale.

### Tailscale Funnel (optional public demo)

If judges need access without joining the tailnet:
```bash
sudo tailscale funnel --bg 8000
```

This makes `https://remembr-pi.tail1234.ts.net` publicly accessible. Use only for demo.

---

## Error Handling

All errors follow this pattern:

**HTTP errors:** Standard HTTP status codes with JSON body:
```json
{ "detail": "Snapshot not found" }
```

**WebSocket errors:**
```json
{
  "type": "error",
  "message": "Description of the error",
  "timestamp": 1709827200.0
}
```

Common error scenarios:
- `"Missing 'label' field for find"` - find_object sent without label
- `"No active detection pipeline"` - camera/Hailo not running
- `"No frame available"` - camera running but no frame captured yet
- `"Pan-tilt controller not connected"` - ESP32 not reachable
- `"Sweep already in progress"` - sweep requested while one is running
- `"Unknown message type: xyz"` - unrecognized WebSocket message type

---

## Quick Test Commands

```bash
# Health check
curl http://<PI>:8000/health

# Find an object
curl -X POST http://<PI>:8000/find \
  -H "Content-Type: application/json" \
  -d '{"label": "phone"}'

# Find with sweep
curl -X POST http://<PI>:8000/find \
  -H "Content-Type: application/json" \
  -d '{"label": "wallet", "sweep": true}'

# Scan medication barcode
curl -X POST http://<PI>:8000/med/scan \
  -H "Content-Type: application/json" \
  -d '{"barcode": "049281003623"}'

# Scan medication by name
curl -X POST http://<PI>:8000/med/scan \
  -H "Content-Type: application/json" \
  -d '{"medication_name": "Metformin"}'

# Get care plan
curl http://<PI>:8000/med/plan

# Trigger sweep
curl -X POST http://<PI>:8000/pantilt/sweep

# Center camera
curl -X POST http://<PI>:8000/pantilt/center

# Get current objects
curl http://<PI>:8000/objects/current

# Get recent objects (last 10 min)
curl "http://<PI>:8000/objects/recent?within=600"

# WebSocket test (using websocat)
echo '{"type":"ping"}' | websocat ws://<PI>:8000/ws
echo '{"type":"find_object","label":"phone"}' | websocat ws://<PI>:8000/ws
echo '{"type":"start_med_scan","barcode":"049281003623"}' | websocat ws://<PI>:8000/ws
```
