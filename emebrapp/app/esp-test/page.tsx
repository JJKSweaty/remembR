"use client";

import { useState } from "react";

const ESP_STORAGE_KEY = "esp_url";

type CommandResult = {
  command: string;
  ok: boolean | null;
  status?: number;
  error?: string;
  ts: number;
};

async function callEsp(espUrl: string, command: string): Promise<CommandResult> {
  try {
    const res = await fetch(`/api/esp/${command}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ espUrl }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return { command, ok: data.ok, status: data.status, error: data.error, ts: Date.now() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { command, ok: false, error: msg, ts: Date.now() };
  }
}

const COMMANDS = [
  { id: "status", label: "Status", color: "#6b7280", desc: "Ping ESP" },
  { id: "sweep", label: "Sweep", color: "#c87840", desc: "Start sweep (~17s)" },
  { id: "pause", label: "Pause", color: "#2563eb", desc: "Pause servo mid-sweep" },
  { id: "stop", label: "Stop", color: "#dc2626", desc: "Stop & end sweep task" },
  { id: "center", label: "Center", color: "#059669", desc: "Return to center position" },
];

export default function EspTestPage() {
  const [espUrl, setEspUrl] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(ESP_STORAGE_KEY) || "http://10.0.0.247:8080";
    }
    return "http://10.0.0.247:8080";
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [log, setLog] = useState<CommandResult[]>([]);

  const saveUrl = (val: string) => {
    setEspUrl(val);
    localStorage.setItem(ESP_STORAGE_KEY, val);
  };

  const run = async (command: string) => {
    if (loading) return;
    setLoading(command);
    const result = await callEsp(espUrl.trim(), command);
    setLog((prev) => [result, ...prev].slice(0, 30));
    setLoading(null);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#f1f5f9",
        fontFamily: "monospace",
        padding: "24px 16px 80px",
        maxWidth: 500,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: "#f8fafc" }}>
        ESP32 Debug Panel
      </h1>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 24 }}>
        Direct ESP control — no Pi required
      </p>

      {/* URL input */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 6 }}>
          ESP URL
        </label>
        <input
          value={espUrl}
          onChange={(e) => saveUrl(e.target.value)}
          placeholder="http://10.0.0.247:8080"
          style={{
            width: "100%",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "10px 12px",
            color: "#f1f5f9",
            fontSize: 14,
            fontFamily: "monospace",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Command buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => run(cmd.id)}
            disabled={!!loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: loading === cmd.id ? "#1e293b" : "#1e293b",
              border: `1.5px solid ${loading === cmd.id ? cmd.color : "#334155"}`,
              borderRadius: 10,
              padding: "14px 16px",
              cursor: loading ? (loading === cmd.id ? "wait" : "not-allowed") : "pointer",
              color: "#f1f5f9",
              transition: "border-color 0.15s",
              opacity: loading && loading !== cmd.id ? 0.5 : 1,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: cmd.color }}>
                {loading === cmd.id ? "Sending..." : cmd.label}
              </span>
              <span style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{cmd.desc}</span>
            </div>
            <span style={{ fontSize: 12, color: "#475569" }}>/{cmd.id}</span>
          </button>
        ))}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Response Log
            </span>
            <button
              onClick={() => setLog([])}
              style={{
                background: "none",
                border: "none",
                color: "#475569",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.map((entry, i) => (
              <div
                key={entry.ts + i}
                style={{
                  background: "#1e293b",
                  border: `1px solid ${entry.ok === true ? "#166534" : entry.ok === false ? "#7f1d1d" : "#334155"}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                    /{entry.command}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: entry.ok === true ? "#4ade80" : "#f87171",
                    }}
                  >
                    {entry.ok === true ? "OK" : "FAIL"}
                  </span>
                </div>
                {entry.status !== undefined && (
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>HTTP {entry.status}</div>
                )}
                {entry.error && (
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 2, wordBreak: "break-all" }}>
                    {entry.error}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                  {new Date(entry.ts).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
