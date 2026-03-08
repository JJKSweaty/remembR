// ── Pi Connection Layer ──────────────────────────────────────────────────────
// Matches the remembR Pi API: http/ws on port 8000

// ── Types ────────────────────────────────────────────────────────────────────

export interface PiObject {
  label: string;
  confidence: number;
  region?: string;
  visible_now?: boolean;
  last_seen?: number;
  last_seen_iso?: string;
  last_seen_ago?: string;
  track_id?: number;
  bbox?: { x: number; y: number; w: number; h: number };
  total_seen_count?: number;
}

export interface FindResult {
  type: "find_result";
  label: string;
  query: string;
  found_now: boolean;
  last_seen: number | null;
  last_seen_iso: string | null;
  last_seen_ago: string | null;
  region: string | null;
  confidence: number | null;
  track_id: number | null;
  snapshot_url: string | null;
  distance_m: number | null;
  distance_text: string | null;
  message: string;
}

export interface MedScanResult {
  type: "med_scan_result";
  status: "match" | "mismatch" | "uncertain";
  barcode: string | null;
  medication_name: string | null;
  dosage: string | null;
  plan_slot: string | null;
  confidence: number;
  safety_notice: string;
  message: string;
}

export interface SnapshotReady {
  type: "snapshot_ready";
  snapshot_id: string;
  url: string;
  timestamp: number;
}

export interface PiHealthResponse {
  status: string;
  pipeline_running: boolean;
  objects_tracked: number;
  websocket_clients: number;
  tailscale_connected: boolean;
  tailscale_ip: string;
  tailscale_hostname: string;
  uptime_seconds: number;
}

// ── URL Helper ───────────────────────────────────────────────────────────────

export const getPiUrl = (): string => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("piUrl") || "http://10.0.0.120:8000";
};

// ── HTTP Endpoints ───────────────────────────────────────────────────────────

export const checkPiHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getPiUrl()}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
};

export const getPiHealthDetails = async (): Promise<PiHealthResponse | null> => {
  try {
    const res = await fetch(`${getPiUrl()}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as PiHealthResponse;
  } catch {
    return null;
  }
};

export const startFind = async (label: string, sweep = false): Promise<FindResult | null> => {
  try {
    const res = await fetch(`${getPiUrl()}/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, sweep }),
    });
    if (!res.ok) return null;
    return (await res.json()) as FindResult;
  } catch {
    return null;
  }
};

export const scanMedication = async (params: { barcode?: string; medication_name?: string }): Promise<MedScanResult | null> => {
  try {
    const res = await fetch(`${getPiUrl()}/med/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return (await res.json()) as MedScanResult;
  } catch {
    return null;
  }
};

export const getMedPlan = async () => {
  try {
    const res = await fetch(`${getPiUrl()}/med/plan`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

export const getSnapshotUrl = (snapshotPath: string): string => {
  return `${getPiUrl()}${snapshotPath}`;
};

export const triggerSweep = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getPiUrl()}/pantilt/sweep`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
};

// ── WebSocket ────────────────────────────────────────────────────────────────

export interface PiWebSocketCallbacks {
  onObjectsUpdate?: (objects: PiObject[]) => void;
  onFindResult?: (result: FindResult) => void;
  onSnapshotReady?: (snapshot: SnapshotReady) => void;
  onMedScanResult?: (result: MedScanResult) => void;
  onSweepResult?: (result: { status: string; message: string; duration_seconds: number }) => void;
  onError?: (message: string) => void;
  onDisconnect?: () => void;
  onConnect?: () => void;
}

export const connectPiWebSocket = (callbacks: PiWebSocketCallbacks): { close: () => void } => {
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionallyClosed = false;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  const connect = () => {
    const wsUrl = getPiUrl().replace("http", "ws") + "/ws";
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = 1000; // Reset backoff on successful connect
      callbacks.onConnect?.();
      // Start keepalive ping
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 15000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as any;

        switch (msg.type) {
          case "objects_update":
            callbacks.onObjectsUpdate?.(msg.objects || []);
            break;

          case "find_result":
            callbacks.onFindResult?.(msg as FindResult);
            break;

          case "snapshot_ready":
            callbacks.onSnapshotReady?.(msg as SnapshotReady);
            break;

          case "med_scan_result":
            callbacks.onMedScanResult?.(msg as MedScanResult);
            // Speak the result aloud with a warm voice
            if (msg.message) {
              import("@/lib/speech").then(({ speak: s }) => s(msg.message));
            }
            break;

          case "sweep_result":
            callbacks.onSweepResult?.(msg);
            break;

          case "error":
            callbacks.onError?.(msg.message || "Unknown error from Pi");
            break;

          case "pong":
            // Keepalive response, no action needed
            break;

          default:
            break;
        }
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onerror = () => {
      callbacks.onDisconnect?.();
    };

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      callbacks.onDisconnect?.();
      if (!intentionallyClosed) {
        scheduleReconnect();
      }
    };
  };

  const scheduleReconnect = () => {
    if (intentionallyClosed) return;
    reconnectTimer = setTimeout(() => {
      connect();
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    }, reconnectDelay);
  };

  // Start first connection
  connect();

  // Return a handle to close cleanly
  return {
    close: () => {
      intentionallyClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingInterval) clearInterval(pingInterval);
      ws?.close();
    },
  };
};

// ── WebSocket send helpers ───────────────────────────────────────────────────

export const wsFindObject = (ws: WebSocket, label: string) => {
  ws.send(JSON.stringify({ type: "find_object", label }));
};

export const wsGetCurrentObjects = (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: "get_current_objects" }));
};

export const wsCaptureSnapshot = (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: "capture_snapshot" }));
};

export const wsMedScan = (ws: WebSocket, params: { barcode?: string; medication_name?: string }) => {
  ws.send(JSON.stringify({ type: "start_med_scan", ...params }));
};

export const wsSweep = (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: "sweep" }));
};
