"use client";

// ── PI TEAM — What this page needs from the Pi ───────────────────────────────
//
// Endpoint: POST /med/scan   (no body required)
//
// The app calls this when the user taps "Scan Medication". The Pi should:
//   1. Look at what's in front of the camera (barcode reader or label OCR)
//   2. Extract the barcode / medication identifier
//   3. Return a JSON response in this shape:
//
//   {
//     type: "med_scan_result",
//     status: "match" | "mismatch" | "uncertain" | "barcode_only",
//     barcode: string | null,          ← the raw barcode value (if found)
//     medication_name: string | null,  ← friendly name if identifiable
//     dosage: string | null,
//     plan_slot: string | null,        ← e.g. "Morning", "Evening"
//     confidence: number,              ← 0–1
//     safety_notice: string,
//     message: string,                 ← sentence Ember reads aloud
//   }
//
// If the Pi can't see a barcode, return { barcode: null } — the app will show
// a "couldn't see it" error and let the user try again.
//
// The Pi pan/tilt service handles camera positioning before scan.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import PageWrapper from "@/components/PageWrapper";
import Orb from "@/components/Orb";
import { scanMedication, type MedScanResult } from "@/lib/pi";
import { speak, preloadVoices } from "@/lib/speech";

type Phase = "idle" | "scanning" | "result";
type OrbMood = "idle" | "scanning" | "found";
type ResultStatus = "match" | "mismatch" | "uncertain" | "barcode_only";

export default function ScanPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [orbMood, setOrbMood] = useState<OrbMood>("idle");
  const [result, setResult] = useState<MedScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState("Looking for your medication…");

  useEffect(() => {
    preloadVoices();
  }, []);

  const handleBarcode = async (barcode: string) => {
    setPhase("result");
    setOrbMood("found");

    try {
      const res = await fetch("/api/medications/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
      });
      const verifyData = await res.json();

      if (verifyData.found) {
        setResult({
          type: "med_scan_result",
          status: verifyData.status === "already_taken" ? "uncertain" : "match",
          barcode,
          medication_name: verifyData.medication_name,
          dosage: verifyData.dosage,
          plan_slot: verifyData.taken_today ? "Already taken today" : "Pending",
          confidence: 1,
          safety_notice: verifyData.safety_notice,
          message: verifyData.message,
        });
        speak(verifyData.message);
      } else {
        setResult({
          type: "med_scan_result",
          status: "mismatch",
          barcode,
          medication_name: null,
          dosage: null,
          plan_slot: null,
          confidence: 0,
          safety_notice: "Please confirm the bottle label before use.",
          message: verifyData.message || "I couldn't find this medication in your current care plan.",
        });
        speak(verifyData.message || "I couldn't find this medication in your care plan.");
      }
    } catch {
      const fallbackMsg = `Scanned barcode: ${barcode}. I couldn't verify it right now. Please check with your caregiver.`;
      setResult({
        type: "med_scan_result",
        status: "uncertain",
        barcode,
        medication_name: null,
        dosage: null,
        plan_slot: null,
        confidence: 0,
        safety_notice: "Please confirm the bottle label before use.",
        message: fallbackMsg,
      });
      speak(fallbackMsg);
    }
  };

  const handleScan = async () => {
    setPhase("scanning");
    setOrbMood("scanning");
    setResult(null);
    setError(null);
    setScanStatus("Centering camera…");

    try {
      speak("Hold your medication bottle in front of the camera.");
      setScanStatus("Reading barcode…");
      const piResult = await scanMedication({});

      if (!piResult) {
        setError("I'm having trouble connecting to the camera. Make sure the Pi is online.");
        setPhase("idle");
        setOrbMood("idle");
        return;
      }

      if (!piResult.barcode) {
        setError("I couldn't see a barcode. Please hold the bottle closer and try again.");
        setPhase("idle");
        setOrbMood("idle");
        speak("I couldn't see the barcode. Try holding it a bit closer.");
        return;
      }

      // If Pi already did full verification (has medication info + status), use it directly.
      // Only fall back to Supabase if Pi returned barcode_only (raw scan, no care plan check).
      if (piResult.status !== "barcode_only" && piResult.medication_name) {
        setPhase("result");
        setOrbMood("found");
        setResult(piResult);
        speak(piResult.message);
        return;
      }

      // Pi gave us a barcode but no medication details — verify against Supabase
      setScanStatus("Verifying medication…");
      handleBarcode(piResult.barcode);

    } catch {
      setError("I'm having trouble connecting to the camera. Make sure the Pi is online.");
      setPhase("idle");
      setOrbMood("idle");
    }
  };

  const handleManualEntry = () => {
    const barcode = prompt("Enter the barcode number:");
    if (barcode && barcode.trim()) {
      setPhase("result");
      setOrbMood("found");
      handleBarcode(barcode.trim());
    }
  };

  const reset = () => {
    setPhase("idle");
    setOrbMood("idle");
    setResult(null);
    setError(null);
  };

  const statusColor = (status: ResultStatus) => {
    switch (status) {
      case "match":       return { bg: "rgba(168,200,160,0.15)", border: "rgba(168,200,160,0.4)", text: "#5a8a52", icon: "✅" };
      case "mismatch":    return { bg: "rgba(220,120,100,0.1)",  border: "rgba(220,120,100,0.3)", text: "#c85a40", icon: "⚠️" };
      case "uncertain":   return { bg: "rgba(200,160,100,0.1)",  border: "rgba(200,160,100,0.3)", text: "#b08840", icon: "❓" };
      case "barcode_only":return { bg: "rgba(200,200,200,0.1)",  border: "rgba(200,200,200,0.3)", text: "#666",    icon: "🔍" };
    }
  };

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>

        {/* Header */}
        <div style={{ marginBottom: 24, animation: "fadeUp 0.5s ease both" }}>
          <p style={{ fontSize: 11, color: "rgba(60,40,20,0.35)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
            Medication Check
          </p>
          <h2
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 40,
              fontWeight: 300,
              lineHeight: 1.1,
              color: "#2a1a08",
              letterSpacing: "-0.3px",
            }}
          >
            {phase === "result" && result
              ? result.status === "match"
                ? <>This is your<br /><em style={{ color: "#5a8a52" }}>{result.medication_name}</em></>
                : result.status === "mismatch"
                ? <>Not in your<br /><em style={{ color: "#c85a40" }}>care plan</em></>
                : <>Scanned<br /><em style={{ color: "#b08840" }}>barcode</em></>
              : <>Scan your<br /><em style={{ color: "#c87840" }}>medication</em></>}
          </h2>
        </div>

        {/* Orb */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <Orb mood={orbMood === "found" ? "happy" : orbMood === "scanning" ? "scanning" : "idle"} size={100} />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "rgba(220,120,100,0.08)",
              border: "1px solid rgba(220,120,100,0.2)",
              borderRadius: 16,
              padding: "14px 18px",
              marginBottom: 20,
              animation: "fadeUp 0.3s ease both",
            }}
          >
            <p style={{ fontSize: 14, color: "#c85a40", margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Idle */}
        {phase === "idle" && (
          <div style={{ animation: "fadeUp 0.5s ease 0.1s both" }}>
            <p
              style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: 17,
                color: "rgba(60,40,20,0.55)",
                fontWeight: 300,
                textAlign: "center",
                marginBottom: 28,
                lineHeight: 1.6,
              }}
            >
              Hold your medication bottle in front of the camera and tap below.
            </p>

            <button
              onClick={handleScan}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #f5c084, #c87840)",
                color: "white",
                border: "none",
                borderRadius: 18,
                padding: "20px",
                fontSize: 17,
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: "0 8px 32px rgba(200,120,64,0.25)",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                letterSpacing: "0.02em",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Scan Medication
            </button>

            <button
              onClick={handleManualEntry}
              style={{
                width: "100%",
                background: "rgba(255,248,236,0.8)",
                color: "rgba(60,40,20,0.55)",
                border: "1px solid rgba(200,160,100,0.2)",
                borderRadius: 18,
                padding: "16px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              }}
            >
              Type barcode number instead
            </button>
          </div>
        )}

        {/* Scanning state */}
        {phase === "scanning" && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <p
              style={{
                textAlign: "center",
                fontSize: 15,
                color: "rgba(60,40,20,0.55)",
                fontWeight: 300,
                marginBottom: 6,
              }}
            >
              {scanStatus}
            </p>
            <div style={{ height: 3, background: "rgba(200,120,64,0.12)", borderRadius: 2, overflow: "hidden", marginTop: 16, marginBottom: 24 }}>
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
            <button
              onClick={reset}
              style={{
                width: "100%",
                background: "transparent",
                color: "rgba(60,40,20,0.5)",
                border: "1px solid rgba(200,160,100,0.2)",
                borderRadius: 16,
                padding: "14px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Result */}
        {phase === "result" && result && (
          <div style={{ animation: "slideUp 0.5s ease both" }}>
            {(() => {
              const colors = statusColor(result.status);
              return (
                <div
                  style={{
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 20,
                    padding: "24px 22px",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 22 }}>{colors.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {result.status === "match" ? "Verified" : result.status === "mismatch" ? "Not Found in Plan" : result.status === "barcode_only" ? "Barcode Found" : "Unverified"}
                    </span>
                  </div>

                  {result.medication_name && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 28, fontWeight: 400, color: "#2a1a08", margin: "0 0 4px" }}>
                        {result.medication_name}
                      </p>
                      {result.dosage && (
                        <p style={{ fontSize: 14, color: "rgba(60,40,20,0.5)", margin: 0 }}>
                          {result.dosage} · {result.plan_slot || ""}
                        </p>
                      )}
                    </div>
                  )}

                  <p style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 17, fontWeight: 300, color: "#2a1a08", lineHeight: 1.6, margin: 0 }}>
                    {result.message}
                  </p>
                </div>
              );
            })()}

            <div style={{ background: "rgba(255,248,236,0.6)", border: "1px solid rgba(200,160,100,0.1)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", margin: 0, lineHeight: 1.5 }}>
                ⚕️ {result.safety_notice}
              </p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { if (result.message) speak(result.message); }}
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
                🔊 Read aloud
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
                Scan again
              </button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
