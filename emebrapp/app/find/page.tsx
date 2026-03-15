"use client";

import { useState, useRef, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import {
  checkPiHealth,
  startFind,
  connectPiWebSocket,
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
  const sweepingRef = useRef(false);
  const wsRef = useRef<{ close: () => void; captureSnapshot: () => boolean } | null>(null);

  useEffect(() => {
    preloadVoices();
    checkPiHealth().then((online) => setPiOnline(online));

    // Connect WebSocket for live object tracking
    const wsHandle = connectPiWebSocket({
      onObjectsUpdate: (objects) => setVisibleObjects(objects),
      onFindResult: (result) => handleFindResult(result),
      onSnapshotReady: (snap) => setSnapshotUrl(getSnapshotUrl(snap.url)),
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
    if (result.found_now) {
      sweepingRef.current = false;
    }
    finalizeFind(result);
  };

  // If snapshot URL arrives slightly after the find result, poll briefly.
  const pollForSnapshot = (label: string) => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      const r = await startFind(label, false);
      if (r?.snapshot_url) {
        clearInterval(timer);
        setSnapshotUrl(getSnapshotUrl(r.snapshot_url));
      } else if (attempts >= 8) {
        clearInterval(timer);
      }
    }, 750);
  };

  const finalizeFind = (result: FindResult) => {
    setFindResult(result);

    if (result.snapshot_url) {
      setSnapshotUrl(getSnapshotUrl(result.snapshot_url));
    } else if (result.found_now) {
      pollForSnapshot(result.label || result.query);
    } else {
      setSnapshotUrl(null);
    }

    if (result.found_now) {
      setPhase("found");
      setOrbMood("found");
    } else if (result.last_seen) {
      setPhase("found");
      setOrbMood("found");
    } else {
      setPhase("not_found");
      setOrbMood("idle");
    }

    if (result.message) {
      speak(result.message);
    }
  };

  const getDemoMode = () => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("piDemoMode") === "true";
  };

  const [scanPhaseText, setScanPhaseText] = useState("Starting camera sweep…");

  const runFakeSimulation = () => {
    setPhase("scanning");
    setOrbMood("scanning");

    // Simulate scanning phases
    setScanPhaseText("Sweeping left…");
    setTimeout(() => setScanPhaseText("Scanning center…"), 1500);
    setTimeout(() => setScanPhaseText("Sweeping right…"), 3000);
    setTimeout(() => setScanPhaseText("Checking memory…"), 4500);

    const demoMode = getDemoMode();
    setTimeout(() => {
      // If we're in demo mode, simulate a find
      // If not, it means the Pi is actually offline/error, so report failure
      const found = demoMode && Math.random() > 0.3;
      if (found) {
        handleFindResult({
          type: "find_result",
          label: selected?.toLowerCase() || "",
          query: selected?.toLowerCase() || "",
          found_now: true,
          last_seen: Date.now() / 1000,
          last_seen_iso: new Date().toISOString(),
          last_seen_ago: "just now",
          region: "left side, near the couch",
          confidence: 0.91,
          track_id: 1,
          snapshot_url: null,
          distance_m: 1.5,
          distance_text: "about 1.5 meters away",
          message: `I found your ${selected?.toLowerCase()} on the left side, near the couch. Detected with 91% confidence.`,
        });
      } else {
        handleFindResult({
          type: "find_result",
          label: selected?.toLowerCase() || "",
          query: selected?.toLowerCase() || "",
          found_now: false,
          last_seen: null,
          last_seen_iso: null,
          last_seen_ago: null,
          region: null,
          confidence: null,
          track_id: null,
          snapshot_url: null,
          distance_m: null,
          distance_text: null,
          message: demoMode 
            ? `I looked around the room but couldn't spot your ${selected?.toLowerCase()}.`
            : `I'm having trouble reaching the remembR Pi. Please check if it's online and connected to Tailscale.`,
        });
      }
    }, 5500);
  };

  const start = async () => {
    if (!selected || sweepingRef.current) return;
    setSnapshotUrl(null);
    setFindResult(null);
    setPhase("scanning");
    setOrbMood("scanning");
    sweepingRef.current = true;
    setScanPhaseText("Starting camera sweep…");

    const demoMode = getDemoMode();

    if (!demoMode) {
      try {
        // Show scanning phases while Pi pan/tilt search runs
        setTimeout(() => setScanPhaseText("Sweeping left…"), 1000);
        setTimeout(() => setScanPhaseText("Scanning center…"), 3000);
        setTimeout(() => setScanPhaseText("Sweeping right…"), 6000);
        setTimeout(() => setScanPhaseText("Checking results…"), 9000);

        speak(`Searching for your ${selected.toLowerCase()}. Please wait a moment while I look around the room.`);
        const piResult = await startFind(selected.toLowerCase(), true);
        sweepingRef.current = false;

        if (piResult) {
          finalizeFind(piResult);
        } else {
          setPhase("not_found");
          setOrbMood("idle");
        }
      } catch (err) {
        console.error("Hardware scan error:", err);
        sweepingRef.current = false;
        runFakeSimulation();
      }
    } else {
      // Demo mode
      runFakeSimulation();
    }
  };

  const reset = () => {
    sweepingRef.current = false;
    setPhase("idle");
    setSelected(null);
    setOrbMood("idle");
    setSnapshotUrl(null);
    setFindResult(null);
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
              {scanPhaseText}
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
                  onError={() => setSnapshotUrl(null)}
                  style={{
                    width: "100%",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                    background: "rgba(248,238,222,0.5)",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: 120,
                    background: "linear-gradient(160deg, rgba(200,160,100,0.15), rgba(200,120,64,0.08))",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(60,40,20,0.25)",
                    fontSize: 13,
                    gap: 8,
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                    <circle cx="9" cy="9" r="2"/>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                  </svg>
                  <span>{findResult.found_now ? "Detecting..." : "No image available"}</span>
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
                onClick={() => start()}
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
                Search again
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

            <div style={{ marginTop: 4 }}>
              <button
                onClick={() => start()}
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                {selected ? `Sweep for my ${selected}` : "Select something first"}
              </button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
