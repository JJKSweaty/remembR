"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, Smartphone, Wallet, Glasses, Tv2, ShoppingBag } from "lucide-react";
import GoldenOrb from "@/components/GoldenOrb";
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

const ITEMS = [
  { label: "Keys",    Icon: KeyRound },
  { label: "Phone",   Icon: Smartphone },
  { label: "Wallet",  Icon: Wallet },
  { label: "Glasses", Icon: Glasses },
  { label: "Remote",  Icon: Tv2 },
  { label: "Bag",     Icon: ShoppingBag },
];

const RING_KEYFRAMES = `
  @keyframes orbRing {
    0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.6; }
    100% { transform: translate(-50%,-50%) scale(3.2); opacity: 0;   }
  }
`;

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

  const [scanPhaseText, setScanPhaseText] = useState("Looking around the room…");

  const runFakeSimulation = () => {
    setPhase("scanning");
    setOrbMood("scanning");

    // Simulate scanning phases
    setScanPhaseText("Looking around the room…");
    setTimeout(() => setScanPhaseText("Scanning center…"), 1500);
    setTimeout(() => setScanPhaseText("Checking all corners…"), 3000);
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
    setScanPhaseText("Looking around the room…");

    const demoMode = getDemoMode();

    if (!demoMode) {
      try {
        // Show scanning phases while Pi searches
        setTimeout(() => setScanPhaseText("Looking around the room…"), 1000);
        setTimeout(() => setScanPhaseText("Scanning center…"), 3000);
        setTimeout(() => setScanPhaseText("Checking all corners…"), 6000);
        setTimeout(() => setScanPhaseText("Checking results…"), 9000);

        speak(`Searching for your ${selected.toLowerCase()}. Please wait a moment while I look around the room.`);
        const piResult = await startFind(selected.toLowerCase(), false);
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

  return (
    <PageWrapper>
      <style dangerouslySetInnerHTML={{ __html: RING_KEYFRAMES }} />
      <div style={{ padding: "0 24px 120px" }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ paddingTop: 28, marginBottom: 32, textAlign: "center" }}
        >
          <p style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 4,
          }}>
            Find My Things
          </p>
          {piOnline !== null && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: piOnline ? "#4CAF82" : "#4A4232",
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 11,
                color: piOnline ? "#4CAF82" : "#4A4232",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              }}>
                {piOnline
                  ? `Camera ready${visibleObjects.length > 0 ? ` · ${visibleObjects.length} objects` : ""}`
                  : "Demo mode"}
              </span>
            </div>
          )}
        </motion.div>

        {/* ── Orb + rings ────────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 28,
        }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Expanding rings when scanning */}
            <AnimatePresence>
              {phase === "scanning" && [0, 0.6, 1.2].map((delay, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    border: "1px solid rgba(239,159,39,0.45)",
                    animation: `orbRing 1.8s ease-out ${delay}s infinite`,
                    pointerEvents: "none",
                  }}
                />
              ))}
            </AnimatePresence>
            <GoldenOrb
              size={80}
              intensity={phase === "scanning" ? "high" : "low"}
            />
          </div>

          {/* Status text while scanning */}
          <AnimatePresence>
            {phase === "scanning" && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                style={{ textAlign: "center", marginTop: 20 }}
              >
                <p style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                  fontSize: 20,
                  fontStyle: "italic",
                  color: "var(--text-primary)",
                  marginBottom: 10,
                }}>
                  Searching for your {selected?.toLowerCase()}…
                </p>
                <p style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                  marginBottom: 14,
                }}>
                  {scanPhaseText}
                </p>
                <button
                  onClick={reset}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: 13,
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Item grid (idle + scanning) ───────────────────────────── */}
        {(phase === "idle" || phase === "scanning") && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginBottom: 24,
          }}>
            {ITEMS.map(({ label, Icon }, i) => {
              const isSelected = selected === label;
              const isScanning = phase === "scanning" && isSelected;
              return (
                <motion.button
                  key={label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => phase === "idle" && setSelected(label)}
                  style={{
                    background: isSelected
                      ? "rgba(239,159,39,0.08)"
                      : "var(--card)",
                    border: isSelected
                      ? "2px solid #EF9F27"
                      : "1px solid rgba(239,159,39,0.15)",
                    borderRadius: 20,
                    height: 100,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: phase === "idle" ? "pointer" : "default",
                    boxShadow: isSelected
                      ? "0 0 16px rgba(239,159,39,0.15)"
                      : "none",
                    transition: "all 0.15s",
                    animation: isScanning ? "cardPulse 1.8s ease-in-out infinite" : "none",
                  }}
                >
                  <Icon
                    size={28}
                    color={isSelected ? "#FAC775" : "#EF9F27"}
                    strokeWidth={1.5}
                  />
                  <span style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                  }}>
                    {label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Find button (idle only) */}
        {phase === "idle" && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.35 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => start()}
            disabled={!selected}
            style={{
              width: "100%",
              padding: "16px",
              background: selected ? "#EF9F27" : "rgba(239,159,39,0.08)",
              color: selected ? "#0F0E09" : "var(--text-muted)",
              border: "none",
              borderRadius: 50,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              cursor: selected ? "pointer" : "not-allowed",
              boxShadow: selected ? "0 4px 20px rgba(239,159,39,0.3)" : "none",
              transition: "all 0.2s",
            }}
          >
            {selected ? `Find my ${selected}` : "Select something first"}
          </motion.button>
        )}

        {/* ── Result card (found / not_found) ───────────────────────── */}
        <AnimatePresence>
          {(phase === "found" || phase === "not_found") && findResult && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{
                background: "var(--card)",
                border: "1px solid rgba(239,159,39,0.15)",
                borderRadius: 24,
                boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              {/* Snapshot / placeholder */}
              {phase === "found" && (
                snapshotUrl ? (
                  <img
                    src={snapshotUrl}
                    alt={`Found ${selected}`}
                    onError={() => setSnapshotUrl(null)}
                    style={{
                      width: "100%",
                      height: "auto",
                      objectFit: "contain",
                      display: "block",
                      borderRadius: "16px 16px 0 0",
                      background: "var(--background)",
                    }}
                  />
                ) : (
                  <div style={{
                    height: 160,
                    background: "var(--background)",
                    borderRadius: "16px 16px 0 0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    border: findResult.found_now
                      ? "1px solid rgba(239,159,39,0.3)"
                      : "none",
                    animation: findResult.found_now ? "shimmer 1.6s ease-in-out infinite" : "none",
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(239,159,39,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                      <circle cx="9" cy="9" r="2"/>
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                    <p style={{
                      fontSize: 13,
                      fontStyle: "italic",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                    }}>
                      {findResult.found_now ? "Getting a clear shot…" : "No image available"}
                    </p>
                  </div>
                )
              )}

              {/* Result info */}
              <div style={{ padding: "20px 20px" }}>
                <p style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                  fontSize: 22,
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--text-primary)",
                  marginBottom: 12,
                  lineHeight: 1.3,
                }}>
                  {phase === "found"
                    ? (findResult.found_now ? `Found your ${findResult.query || selected}` : `Last saw your ${findResult.query || selected}`)
                    : `Couldn't find your ${selected?.toLowerCase()}`}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  {findResult.confidence && (
                    <span style={{
                      background: "rgba(239,159,39,0.12)",
                      border: "1px solid rgba(239,159,39,0.25)",
                      borderRadius: 50,
                      padding: "4px 12px",
                      fontSize: 12,
                      color: "#EF9F27",
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      fontWeight: 500,
                    }}>
                      {Math.round(findResult.confidence * 100)}% confident
                    </span>
                  )}
                  {findResult.last_seen_ago && (
                    <span style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    }}>
                      {findResult.last_seen_ago}
                    </span>
                  )}
                </div>

                {findResult.message && (
                  <p style={{
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    lineHeight: 1.6,
                    marginBottom: 20,
                  }}>
                    {findResult.message}
                  </p>
                )}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={reset}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "transparent",
                    color: "#EF9F27",
                    border: "1px solid rgba(239,159,39,0.4)",
                    borderRadius: 50,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  Search Again
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </PageWrapper>
  );
}
