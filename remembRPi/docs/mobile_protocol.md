# Mobile App Protocol

This document defines the message schema for phone app communication with remembR.

## Connection

- **WebSocket:** `ws://<host>:8000/ws`
- **HTTP base:** `http://<host>:8000`

The `<host>` should be the Pi's Tailscale MagicDNS hostname (preferred) or Tailscale IPv4 (fallback).

## WebSocket Messages

### Inbound (Phone -> Pi)

#### ping

Health check to verify the connection is alive.

```json
{"type": "ping"}
```

Response:
```json
{"type": "pong", "timestamp": 1709827200.0}
```

#### find

Search for a missing object. The `label` field accepts natural language names; the backend resolves aliases (e.g., "wallet" -> "handbag", "phone" -> "cell phone").

```json
{"type": "find", "label": "wallet"}
```

Response:
```json
{
  "type": "find_result",
  "label": "handbag",
  "query": "wallet",
  "found_now": false,
  "last_seen": 1709827080.5,
  "last_seen_iso": "2026-03-07T14:18:00.500000+00:00",
  "last_seen_ago": "2 minutes ago",
  "region": "left side",
  "confidence": 0.82,
  "track_id": 5,
  "snapshot_url": "/snapshots/handbag_2026-03-07_14-18-00_abc123.jpg",
  "message": "I last saw wallet 2 minutes ago in the left side. It's not visible right now, but was detected with 82% confidence."
}
```

If the object is found now:
```json
{
  "type": "find_result",
  "label": "cell phone",
  "query": "phone",
  "found_now": true,
  "last_seen_ago": "just now",
  "region": "center area",
  "confidence": 0.91,
  "message": "Phone is visible right now in the center area. Detected with 91% confidence."
}
```

If not found:
```json
{
  "type": "find_result",
  "label": "cell phone",
  "query": "phone",
  "found_now": false,
  "last_seen": null,
  "region": null,
  "message": "I haven't seen phone (looking for 'cell phone') in my memory. It may not have been in view of the camera."
}
```

#### get_current_objects

Request all objects currently visible in the camera feed.

```json
{"type": "get_current_objects"}
```

Response:
```json
{
  "type": "objects_update",
  "objects": [
    {
      "label": "bottle",
      "confidence": 0.87,
      "bbox": {"x": 0.45, "y": 0.3, "w": 0.08, "h": 0.2},
      "track_id": 3,
      "timestamp": 1709827200.0
    },
    {
      "label": "cup",
      "confidence": 0.72,
      "bbox": {"x": 0.6, "y": 0.5, "w": 0.06, "h": 0.1},
      "track_id": null,
      "timestamp": 1709827200.0
    }
  ],
  "timestamp": 1709827200.0
}
```

#### capture_snapshot

Request an immediate snapshot from the camera.

```json
{"type": "capture_snapshot"}
```

Response:
```json
{
  "type": "snapshot_ready",
  "snapshot_id": "manual_2026-03-07_14-20-00_def456.jpg",
  "url": "/snapshots/manual_2026-03-07_14-20-00_def456.jpg",
  "timestamp": 1709827200.0
}
```

### Outbound (Pi -> Phone) - Pushed Events

These messages are broadcast to all connected clients when relevant events occur.

#### objects_update

Sent when new detections are processed by the memory worker.

```json
{
  "type": "objects_update",
  "objects": [...],
  "timestamp": 1709827200.0
}
```

#### snapshot_ready

Sent when a notable detection triggers an automatic snapshot.

```json
{
  "type": "snapshot_ready",
  "snapshot_id": "bottle_2026-03-07_14-20-00_abc123.jpg",
  "url": "/snapshots/bottle_2026-03-07_14-20-00_abc123.jpg",
  "timestamp": 1709827200.0
}
```

#### error

Sent when an error occurs during message processing.

```json
{
  "type": "error",
  "message": "Description of the error",
  "timestamp": 1709827200.0
}
```

## HTTP Endpoints

### GET /health

```json
{
  "status": "ok",
  "pipeline_running": true,
  "objects_tracked": 12,
  "websocket_clients": 1,
  "tailscale_connected": true,
  "tailscale_ip": "100.x.y.z",
  "tailscale_hostname": "secondsight.tail12345.ts.net",
  "uptime_seconds": 3600.5
}
```

### GET /objects/current

Same schema as the `objects_update` WebSocket message but wrapped in an HTTP response with `objects`, `count`, and `timestamp` fields.

### GET /objects/recent?within=300

Same schema as `/objects/current`. The `within` parameter specifies the time window in seconds (default 300 = 5 minutes).

### POST /find

Request body:
```json
{"label": "wallet"}
```

Response: Same schema as WebSocket `find_result`.

### GET /snapshots/{id}

Returns the JPEG image file directly. Use the URL from `find_result.snapshot_url` or `snapshot_ready.url`.

### POST /command

Request:
```json
{"command": "status", "args": {}}
```

Supported commands: `status`, `clear_memory`, `force_persist`.

### GET /status

Detailed system information including Tailscale, camera, Hailo, and memory status.

## Reconnection Strategy

The phone app should implement reconnection logic:

1. Send `{"type": "ping"}` every 30 seconds
2. If no `pong` received within 5 seconds, mark connection as unhealthy
3. On disconnect, wait 3 seconds and reconnect
4. Store the Tailscale hostname in the app so reconnection uses the correct address

## Label Aliases

User queries are automatically mapped to COCO detection labels:

| User says | Detected as |
|-----------|-------------|
| phone, cellphone, mobile | cell phone |
| wallet, billfold | handbag |
| bag, purse | handbag/backpack |
| mug, glass, coffee | cup |
| controller, tv remote | remote |
| monitor, screen, display | tv |
| shears | scissors |
| watch, timer | clock |

Full alias list is in `config/labels.yaml`.
