"use client";

import { useState, useRef, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import {
  checkPiHealth,
  startFind,
  connectPiWebSocket,
  wsFindObject,
  getSnapshotUrl,
  type FindResult,
  type PiObject,
} from "@/lib/pi";
import { speak, preloadVoices } from "@/lib/speech";

type Phase = "idle" | "scanning" | "found" | "not_found";
type OrbMood = "idle" | "scanning" | "found";

const items = ["Keys", "Wallet", "Phone", "Glasses", "Remote", "Medication", "Bag", "Watch", "Cup"];

export default function Find() {
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [orbMood, setOrbMood] = useState<OrbMood>("idle");
  const [piOnline, setPiOnline] = useState<boolean | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [findResult, setFindResult] = useState<FindResult | null>(null);
  const [visibleObjects, setVisibleObjects] = useState<PiObject[]>([]);
  const [sweeping, setSweeping] = useState(false);
  const wsRef = useRef<{ close: () => void } | null>(null);

  useEffect(() => {
    preloadVoices();
    checkPiHealth().then((online) => setPiOnline(online));

    // Connect WebSocket for live object tracking
    const wsHandle = connectPiWebSocket({
      onObjectsUpdate: (objects) => setVisibleObjects(objects),
      onFindResult: (result) => handleFindResult(result),
      onSnapshotReady: (snap) => setSnapshotUrl(getSnapshotUrl(snap.url)),
      onSweepResult: () => setSweeping(false),
      onConnect: () => setPiOnline(true),
      onDisconnect: () => setPiOnline(false),
      onError: (msg) => console.error("Pi error:", msg),
    });
    wsRef.current = wsHandle;

    return () => {
      wsHandle.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFindResult = (result: FindResult) => {
    setFindResult(result);
    if (result.found_now) {
      setPhase("found");
      setOrbMood("found");
      if (result.snapshot_url) {
        setSnapshotUrl(getSnapshotUrl(result.snapshot_url));
      }
    } else if (result.last_seen) {
      // Seen before but not visible now
      setPhase("found");
      setOrbMood("found");
    } else {
      setPhase("not_found");
      setOrbMood("idle");
    }

    // Speak the result with a warm voice
    if (result.message) {
      speak(result.message);
    }
  };

  const getDemoMode = () => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("piDemoMode") === "true";
  };

  const runFakeSimulation = () => {
    setPhase("scanning");
    setOrbMood("scanning");
    setTimeout(() => {
      const fakeResult: FindResult = {
        type: "find_result",
        label: selected?.toLowerCase() || "",
        query: selected?.toLowerCase() || "",
        found_now: true,
        last_seen: Date.now() / 1000,
        last_seen_iso: new Date().toISOString(),
        last_seen_ago: "just now",
        region: "center area, on the table",
        confidence: 0.91,
        track_id: 1,
        snapshot_url: null,
        distance_m: 1.5,
        distance_text: "about 1.5 meters away",
        message: `${selected} is visible right now in the center area. Detected with 91% confidence.`,
      };
      handleFindResult(fakeResult);
    }, 2500);
  };

  const start = async (withSweep = false) => {
    if (!selected) return;
    setSnapshotUrl(null);
    setFindResult(null);
    setPhase("scanning");
    setOrbMood("scanning");
    if (withSweep) setSweeping(true);

    const demoMode = getDemoMode();

    if (piOnline && !demoMode) {
      try {
        // Use HTTP endpoint for find (supports sweep)
        const result = await startFind(selected.toLowerCase(), withSweep);
        setSweeping(false);
        if (result) {
          handleFindResult(result);
        } else {
          runFakeSimulation();
        }
      } catch {
        setSweeping(false);
        runFakeSimulation();
      }
    } else {
      // Demo mode
      if (withSweep) {
        setTimeout(() => setSweeping(false), 3000);
      }
      runFakeSimulation();
    }
  };

  const reset = () => {
    wsRef.current; // keep WS alive
    setPhase("idle");
    setSelected(null);
    setOrbMood("idle");
    setSnapshotUrl(null);
    setFindResult(null);
    setSweeping(false);
  };

  const speakResult = () => {
    if (findResult?.message) speak(findResult.message);
  };

  const statusIndicator =
    piOnline === null ? null : piOnline ? (
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          color: "rgba(60,40,20,0.4)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#7dc87a",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        Camera ready
        {visibleObjects.length > 0 && ` · ${visibleObjects.length} objects`}
      </span>
    ) : (
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          color: "#c87840",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#c87840",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        Demo mode
      </span>
    );

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>
        <div style={{ animation: "fadeUp 0.5s ease both", marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: "rgba(60,40,20,0.35)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Second Sight
            </p>
            {statusIndicator}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 40,
              fontWeight: 300,
              color: "#2a1a08",
              letterSpacing: "-0.3px",
              lineHeight: 1.1,
            }}
          >
            {phase === "found" ? (
              <>
                {findResult?.found_now ? "Found your" : "Last saw your"}
                <br />
                <em style={{ color: "#c87840" }}>{findResult?.query || selected}</em>
              </>
            ) : phase === "not_found" ? (
              <>
                {"Haven't seen"}
                <br />
                <em style={{ color: "#c87840" }}>{selected}</em>
              </>
            ) : (
              <>
                {"Find my"}
                <br />
                <em style={{ color: "#c87840" }}>things</em>
              </>
            )}
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 32,
            animation: "fadeIn 0.5s ease 0.1s both",
          }}
        >
          <Orb mood={orbMood} size={phase === "scanning" ? 100 : 120} />
        </div>

        {/* Scanning state */}
        {phase === "scanning" && (
          <div style={{ animation: "fadeUp 0.4s ease both", marginBottom: 24 }}>
            <p
              style={{
                textAlign: "center",
                fontSize: 15,
                color: "rgba(60,40,20,0.55)",
                fontWeight: 300,
                marginBottom: 6,
              }}
            >
              {sweeping ? `Sweeping the room for ${selected}…` : `Looking for your ${selected}…`}
            </p>
            <div
              style={{
                height: 3,
                background: "rgba(200,120,64,0.12)",
                borderRadius: 2,
                overflow: "hidden",
                marginTop: 16,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "60%",
                  background: "linear-gradient(90deg, #f5c084, #c87840)",
                  borderRadius: 2,
                  animation: "scanPulse 1.5s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        )}

        {/* Found or last seen */}
        {phase === "found" && findResult && (
          <div style={{ animation: "slideUp 0.5s ease both" }}>
            {/* Snapshot */}
            <div
              style={{
                borderRadius: 22,
                overflow: "hidden",
                border: "1px solid rgba(200,160,100,0.2)",
                marginBottom: 16,
                boxShadow: "0 8px 40px rgba(120,80,40,0.1)",
              }}
            >
              {snapshotUrl ? (
                <img
                  src={snapshotUrl}
                  alt={`Found ${selected}`}
                  style={{
                    width: "100%",
                    height: 180,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: 120,
                    background: "linear-gradient(160deg, rgba(200,160,100,0.15), rgba(200,120,64,0.08))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(60,40,20,0.25)",
                    fontSize: 13,
                  }}
                >
                  {findResult.found_now ? "Live view" : "No snapshot available"}
                </div>
              )}
              <div
                style={{
                  padding: "12px 18px",
                  background: "rgba(254,250,244,0.8)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 12, color: "rgba(60,40,20,0.45)" }}>
                  {findResult.confidence
                    ? `${Math.round(findResult.confidence * 100)}% confidence`
                    : "—"}
                </span>
                <span style={{ fontSize: 12, color: "rgba(60,40,20,0.3)" }}>
                  {findResult.last_seen_ago || "—"}
                </span>
              </div>
            </div>

            {/* Pi's message */}
            <div
              style={{
                background: "rgba(255,248,236,0.8)",
                border: "1px solid rgba(200,160,100,0.15)",
                borderRadius: 20,
                padding: "20px 22px",
                marginBottom: 14,
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  fontSize: 20,
                  fontWeight: 300,
                  color: "#2a1a08",
                  lineHeight: 1.6,
                  marginBottom: findResult.distance_text ? 14 : 0,
                }}
              >
                {findResult.message}
              </p>
              {findResult.distance_text && (
                <>
                  <div
                    style={{
                      height: 1,
                      background: "rgba(200,160,100,0.12)",
                      margin: "0 0 14px",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: "#c87840",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: "rgba(60,40,20,0.55)",
                        fontWeight: 300,
                        lineHeight: 1.5,
                      }}
                    >
                      {findResult.distance_text}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={speakResult}
                style={{
                  flex: 2,
                  background: "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 16,
                  padding: "16px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow: "0 6px 24px rgba(200,120,64,0.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>🔊</span> Read aloud
              </button>
              <button
                onClick={reset}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "rgba(60,40,20,0.5)",
                  border: "1px solid rgba(200,160,100,0.2)",
                  borderRadius: 16,
                  padding: "16px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Again
              </button>
            </div>
          </div>
        )}

        {/* Not found */}
        {phase === "not_found" && findResult && (
          <div style={{ animation: "slideUp 0.5s ease both" }}>
            <div
              style={{
                background: "rgba(255,248,236,0.8)",
                border: "1px solid rgba(200,160,100,0.15)",
                borderRadius: 20,
                padding: "24px 22px",
                marginBottom: 14,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  fontSize: 20,
                  fontWeight: 300,
                  color: "#2a1a08",
                  lineHeight: 1.6,
                }}
              >
                {findResult.message}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => start(true)}
                style={{
                  flex: 2,
                  background: "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 16,
                  padding: "16px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow: "0 6px 24px rgba(200,120,64,0.28)",
                }}
              >
                Sweep the room
              </button>
              <button
                onClick={reset}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "rgba(60,40,20,0.5)",
                  border: "1px solid rgba(200,160,100,0.2)",
                  borderRadius: 16,
                  padding: "16px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Idle: item selection */}
        {phase === "idle" && (
          <div style={{ animation: "fadeUp 0.5s ease 0.15s both" }}>
            <p
              style={{
                fontSize: 11,
                color: "rgba(60,40,20,0.35)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              What are we looking for?
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
              {items.map((item) => (
                <button
                  key={item}
                  onClick={() => setSelected(item)}
                  style={{
                    background:
                      selected === item
                        ? "rgba(200,120,64,0.12)"
                        : "rgba(255,248,236,0.7)",
                    border: `1px solid ${
                      selected === item
                        ? "rgba(200,120,64,0.4)"
                        : "rgba(200,160,100,0.15)"
                    }`,
                    borderRadius: 40,
                    padding: "10px 18px",
                    fontSize: 14,
                    fontWeight: selected === item ? 500 : 300,
                    color: selected === item ? "#c87840" : "rgba(60,40,20,0.6)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {item}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => start(false)}
                disabled={!selected}
                style={{
                  width: "100%",
                  background: selected
                    ? "linear-gradient(135deg, #f5c084, #c87840)"
                    : "rgba(200,160,100,0.1)",
                  color: selected ? "white" : "rgba(60,40,20,0.2)",
                  border: "none",
                  borderRadius: 18,
                  padding: "20px",
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: selected ? "pointer" : "not-allowed",
                  boxShadow: selected
                    ? "0 8px 32px rgba(200,120,64,0.25)"
                    : "none",
                  transition: "all 0.2s",
                  fontFamily:
                    "var(--font-cormorant), 'Cormorant Garamond', serif",
                  letterSpacing: "0.02em",
                }}
              >
                {selected ? `Find my ${selected}` : "Select something first"}
              </button>

              {selected && piOnline && (
                <button
                  onClick={() => start(true)}
                  style={{
                    width: "100%",
                    background: "rgba(255,248,236,0.8)",
                    color: "rgba(60,40,20,0.55)",
                    border: "1px solid rgba(200,160,100,0.2)",
                    borderRadius: 18,
                    padding: "16px",
                    fontSize: 14,
                    fontWeight: 400,
                    cursor: "pointer",
                    fontFamily:
                      "var(--font-cormorant), 'Cormorant Garamond', serif",
                  }}
                >
                  Search with room sweep (~30s)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
