"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Pill, Check, X, ScanLine } from "lucide-react";
import GoldenOrb from "@/components/GoldenOrb";
import PageWrapper from "@/components/PageWrapper";
import { logMedication, getFullContext } from "@/lib/memory";
import { showToast } from "@/lib/voice";
import { parseTimeToDate } from "@/lib/time";
import { scanMedication, type MedScanResult } from "@/lib/pi";
import { speak } from "@/lib/speech";

// ── Types ──────────────────────────────────────────────────────────────────────

type OrbMood = "idle" | "scanning" | "happy";

interface Med {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
  taken_today: boolean;
  taken_at?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMedStatus(med: Med, now: Date): "Upcoming" | "Due Now" | "Overdue" {
  const diffMin = (now.getTime() - parseTimeToDate(med.schedule).getTime()) / 60000;
  if (diffMin < -30) return "Upcoming";
  if (diffMin <= 30)  return "Due Now";
  return "Overdue";
}

function formatTakenAt(ts?: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function to12h(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Progress ring ─────────────────────────────────────────────────────────────

const RING_R    = 26;
const RING_CIRC = 2 * Math.PI * RING_R;

function Ring({ pct }: { pct: number }) {
  return (
    <svg width={64} height={64} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={32} cy={32} r={RING_R} fill="none" stroke="rgba(239,159,39,0.12)" strokeWidth={5} />
      <motion.circle
        cx={32} cy={32} r={RING_R}
        fill="none" stroke="#EF9F27" strokeWidth={5} strokeLinecap="round"
        strokeDasharray={RING_CIRC}
        initial={{ strokeDashoffset: RING_CIRC }}
        animate={{ strokeDashoffset: RING_CIRC * (1 - pct) }}
        transition={{ duration: 1.2, delay: 0.4, ease: "easeOut" }}
      />
    </svg>
  );
}

// ── Days ──────────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Input style ───────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: "100%",
  background: "var(--background)",
  border: "1px solid rgba(239,159,39,0.2)",
  borderRadius: 12,
  padding: "14px 16px",
  color: "var(--text-primary)",
  fontSize: 15,
  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
  outline: "none",
  colorScheme: "dark",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Meds() {
  const router = useRouter();

  // ── Existing state (do not modify) ─────────────────────────────────────────
  const [meds, setMeds]           = useState<Med[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [orbMood, setOrbMood]     = useState<OrbMood>("scanning");

  // ── Add sheet state ────────────────────────────────────────────────────────
  const [showSheet, setShowSheet] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [newMed, setNewMed]       = useState({ name: "", dosage: "", schedule: "", days: [] as string[] });
  const [formError, setFormError] = useState<{ name?: string; schedule?: string }>({});

  // ── Scan sheet state ───────────────────────────────────────────────────────
  const [showScanSheet, setShowScanSheet]   = useState(false);
  const [scanPhase, setScanPhase]           = useState<"idle" | "scanning" | "result">("idle");
  const [scanResult, setScanResult]         = useState<MedScanResult | null>(null);
  const [scanError, setScanError]           = useState<string | null>(null);
  const [scanStatus, setScanStatus]         = useState("Reading barcode…");

  // ── Existing effects (do not modify) ───────────────────────────────────────

  useEffect(() => {
    const fetchMeds = async () => {
      try {
        const res = await fetch("/api/medications");
        const data = await res.json() as { medications: Med[] };
        setMeds(data.medications || []);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchMeds();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (meds.length === 0) {
      setAiMessage("Add your medications in Settings to track them here.");
      setOrbMood("idle");
      return;
    }
    const fetchReminder = async () => {
      try {
        const context = getFullContext();
        const res = await fetch("/api/meds-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meds, context }),
        });
        const data = await res.json() as { message: string };
        setAiMessage(data.message);
      } catch {
        setAiMessage("Here are your medicines for today.");
      } finally {
        setOrbMood("idle");
      }
    };
    fetchReminder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (loading || meds.length === 0) return;
    const now = new Date();
    const overdue = meds.find((med) => {
      if (med.taken_today) return false;
      return parseTimeToDate(med.schedule) < now;
    });
    if (!overdue) return;
    const t = setTimeout(() => {
      setOrbMood("scanning");
      showToast(`💊 Don't forget your ${overdue.name}. Due at ${overdue.schedule}.`);
      setTimeout(() => setOrbMood("idle"), 4000);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleToggle = async (id: string, taken: boolean) => {
    setMeds((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, taken_today: taken, taken_at: taken ? new Date().toISOString() : null }
          : m
      )
    );
    const med = meds.find((m) => m.id === id);
    if (med && taken) {
      logMedication({ name: med.name, dose: med.dosage, time: med.schedule, taken: true });
    }
    try {
      const res = await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, taken_today: taken }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, taken_today: !taken } : m)));
      showToast("Couldn't save. Please try again.");
    }
  };

  // ── Add med handler ────────────────────────────────────────────────────────

  const handleAddMed = async () => {
    const errs: { name?: string; schedule?: string } = {};
    if (!newMed.name.trim()) errs.name = "Medication name is required";
    if (!newMed.schedule)    errs.schedule = "Time is required";
    if (Object.keys(errs).length > 0) { setFormError(errs); return; }
    setFormError({});
    setSaving(true);
    try {
      const res = await fetch("/api/medications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMed.name.trim(),
          dosage: newMed.dosage.trim(),
          schedule: to12h(newMed.schedule),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.medication) {
        setMeds((prev) => [...prev, data.medication]);
      } else {
        const r = await fetch("/api/medications");
        const d = await r.json();
        setMeds(d.medications || []);
      }
      setNewMed({ name: "", dosage: "", schedule: "", days: [] });
      setFormError({});
      setShowSheet(false);
      showToast("Medication added");
    } catch {
      showToast("Couldn't save medication. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Scan handlers ─────────────────────────────────────────────────────────

  const resetScan = () => {
    setScanPhase("idle");
    setScanResult(null);
    setScanError(null);
    setScanStatus("Reading barcode…");
  };

  const handleScanBarcode = async (barcode: string) => {
    setScanStatus("Verifying medication…");
    try {
      const res = await fetch("/api/medications/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
      });
      const verifyData = await res.json();
      if (verifyData.found) {
        setScanResult({
          type: "med_scan_result",
          status: verifyData.status === "already_taken" ? "uncertain" : "match",
          barcode,
          medication_name: verifyData.medication_name,
          dosage: verifyData.dosage,
          plan_slot: verifyData.plan_slot,
          confidence: 1,
          safety_notice: verifyData.safety_notice,
          message: verifyData.message,
        } as MedScanResult);
        speak(verifyData.message);
      } else {
        setScanResult({
          type: "med_scan_result",
          status: "mismatch",
          barcode,
          medication_name: null,
          dosage: null,
          plan_slot: null,
          confidence: 0,
          safety_notice: "Please confirm the bottle label before use.",
          message: verifyData.message,
        } as MedScanResult);
        speak(verifyData.message);
      }
      setScanPhase("result");
    } catch {
      setScanError("Couldn't verify the medication. Please try again.");
      setScanPhase("idle");
    }
  };

  const handleScan = async () => {
    setScanPhase("scanning");
    setScanResult(null);
    setScanError(null);
    setScanStatus("Centering camera…");
    try {
      speak("Hold your medication bottle in front of the camera.");
      setScanStatus("Reading barcode…");
      const piResult = await scanMedication({});
      if (!piResult) {
        setScanError("Can't reach the camera. Make sure the Pi is online.");
        setScanPhase("idle");
        return;
      }
      if (!piResult.barcode) {
        setScanError("Couldn't see a barcode. Hold the bottle closer and try again.");
        setScanPhase("idle");
        speak("I couldn't see the barcode. Try holding it a bit closer.");
        return;
      }
      if (piResult.status !== "barcode_only" && piResult.medication_name) {
        setScanResult(piResult);
        setScanPhase("result");
        speak(piResult.message);
        return;
      }
      handleScanBarcode(piResult.barcode);
    } catch {
      setScanError("Something went wrong connecting to the camera.");
      setScanPhase("idle");
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const taken    = meds.filter((m) => m.taken_today).length;
  const total    = meds.length;
  const allDone  = total > 0 && taken === total;
  const now      = new Date();

  const sortedMeds = [...meds].sort((a, b) => {
    if (a.taken_today && !b.taken_today) return 1;
    if (!a.taken_today && b.taken_today) return -1;
    if (!a.taken_today && !b.taken_today) {
      const aOv = getMedStatus(a, now) === "Overdue";
      const bOv = getMedStatus(b, now) === "Overdue";
      if (aOv && !bOv) return -1;
      if (!aOv && bOv) return 1;
    }
    return 0;
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _aiMessage = aiMessage;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _orbMood = orbMood;

  return (
    <PageWrapper>
      <div style={{ padding: "0 24px 120px" }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(239,159,39,0.1)",
          marginBottom: 20,
        }}>
          <button
            onClick={() => router.push("/")}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(239,159,39,0.08)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={18} color="#EF9F27" strokeWidth={2} />
          </button>

          <p style={{
            fontSize: 24, fontStyle: "italic", fontWeight: 400,
            color: "var(--text-primary)",
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            lineHeight: 1,
          }}>
            Medications
          </p>

          <div style={{ width: 36 }} />
        </div>

        {/* ── Action buttons ────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { resetScan(); setShowScanSheet(true); }}
            style={{
              flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "transparent",
              border: "1px solid rgba(239,159,39,0.4)",
              borderRadius: 30,
              padding: "12px 20px",
              color: "#EF9F27",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              cursor: "pointer",
            }}
          >
            <ScanLine size={16} color="#EF9F27" strokeWidth={2} />
            Scan Bottle
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowSheet(true)}
            style={{
              flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "#EF9F27",
              border: "none",
              borderRadius: 30,
              padding: "12px 20px",
              color: "#0F0E09",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(239,159,39,0.3)",
            }}
          >
            <Plus size={16} color="#0F0E09" strokeWidth={2.5} />
            Add Manual
          </motion.button>
        </div>

        {/* ── Progress card ─────────────────────────────────────────────── */}
        {total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              background: "var(--card)",
              border: "1px solid rgba(239,159,39,0.15)",
              borderRadius: 24,
              boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
              padding: "20px 24px",
              marginBottom: 20,
            }}
          >
            {/* Count + ring */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{
                  fontSize: 56,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                  fontWeight: 400,
                  color: "#EF9F27",
                  lineHeight: 1,
                  marginBottom: 4,
                }}>
                  {taken}/{total}
                </div>
                <div style={{
                  fontSize: 13, color: "var(--text-secondary)",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                }}>
                  {allDone ? "All done today" : "taken today"}
                </div>
              </div>
              <Ring pct={total > 0 ? taken / total : 0} />
            </div>

            {/* Linear bar */}
            <div style={{ height: 4, background: "rgba(239,159,39,0.1)", borderRadius: 4, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${total > 0 ? (taken / total) * 100 : 0}%` }}
                transition={{ duration: 1.0, delay: 0.5, ease: "easeOut" }}
                style={{
                  height: "100%",
                  background: allDone ? "#4CAF82" : "#EF9F27",
                  borderRadius: 4,
                }}
              />
            </div>
          </motion.div>
        )}

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 80, borderRadius: 18,
                background: "rgba(239,159,39,0.05)",
                animation: "shimmer 1.6s ease-in-out infinite",
                animationDelay: `${i * 0.1}s`,
              }} />
            ))}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!loading && (loadError || total === 0) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{ textAlign: "center", padding: "48px 0" }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <GoldenOrb size={80} intensity="low" />
            </div>
            <p style={{
              fontSize: 22, fontStyle: "italic", color: "var(--text-primary)",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              marginBottom: 8,
            }}>
              No medications yet
            </p>
            <p style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
              Tap + to add your first medication
            </p>
          </motion.div>
        )}

        {/* ── Med cards ─────────────────────────────────────────────────── */}
        {!loading && !loadError && total > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <AnimatePresence mode="popLayout">
              {sortedMeds.map((med, i) => {
                const status   = getMedStatus(med, now);
                const isOverdue = !med.taken_today && status === "Overdue";

                return (
                  <motion.div
                    key={med.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40, scale: 0.96 }}
                    transition={{ duration: 0.35, delay: i * 0.07 }}
                    style={{
                      background: "var(--card)",
                      border: "1px solid rgba(239,159,39,0.12)",
                      borderRadius: 18,
                      display: "flex",
                      alignItems: "stretch",
                      overflow: "hidden",
                      opacity: med.taken_today ? 0.65 : 1,
                    }}
                  >
                    {/* Accent bar */}
                    <div style={{
                      width: 4, flexShrink: 0,
                      background: med.taken_today
                        ? "#4CAF82"
                        : isOverdue ? "#E24B4A" : "#EF9F27",
                    }} />

                    <div style={{
                      flex: 1, display: "flex", alignItems: "center",
                      gap: 14, padding: "16px 16px 16px 18px",
                    }}>
                      {/* Icon */}
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: "rgba(239,159,39,0.1)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <Pill size={18} color="#EF9F27" strokeWidth={2} />
                      </div>

                      {/* Name + details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 16, fontWeight: 600, color: "var(--text-primary)",
                          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                          marginBottom: 3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {med.name}
                        </p>
                        <p style={{
                          fontSize: 13, color: "var(--text-secondary)",
                          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        }}>
                          {med.dosage ? `${med.dosage} · ` : ""}{med.schedule}
                        </p>
                      </div>

                      {/* Right: status */}
                      <div style={{ flexShrink: 0 }}>
                        {med.taken_today ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <Check size={14} color="#4CAF82" strokeWidth={2.5} />
                            <span style={{
                              fontSize: 12, color: "#4CAF82",
                              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                            }}>
                              {med.taken_at ? `Taken ${formatTakenAt(med.taken_at)}` : "Taken"}
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                            {isOverdue && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <motion.div
                                  animate={{ opacity: [1, 0.3, 1] }}
                                  transition={{ duration: 1.2, repeat: Infinity }}
                                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#E24B4A" }}
                                />
                                <span style={{
                                  fontSize: 11, color: "#E24B4A",
                                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                                  fontWeight: 500,
                                }}>
                                  Overdue
                                </span>
                              </div>
                            )}
                            <motion.button
                              whileTap={{ scale: 0.92 }}
                              onClick={() => handleToggle(med.id, true)}
                              style={{
                                background: "#EF9F27",
                                color: "#0F0E09",
                                border: "none",
                                borderRadius: 30,
                                padding: "7px 16px",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                                boxShadow: "0 2px 10px rgba(239,159,39,0.35)",
                              }}
                            >
                              Take
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

      </div>

      {/* ── Scan medication bottom sheet ──────────────────────────────── */}
      <AnimatePresence>
        {showScanSheet && (
          <>
            <motion.div
              key="scan-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (scanPhase !== "scanning") { resetScan(); setShowScanSheet(false); } }}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }}
            />
            <motion.div
              key="scan-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{
                position: "fixed", bottom: 0, left: 0, right: 0,
                background: "var(--surface)",
                borderRadius: "24px 24px 0 0",
                padding: "24px 24px 56px",
                zIndex: 101,
                border: "1px solid rgba(239,159,39,0.15)",
                borderBottom: "none",
              }}
            >
              {/* Drag handle */}
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(239,159,39,0.2)", margin: "0 auto 24px" }} />

              {/* Title row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
                <p style={{
                  fontSize: 20, fontStyle: "italic", fontWeight: 400, color: "var(--text-primary)",
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                }}>
                  {scanPhase === "result" ? "Scan Result" : "Scan Medication"}
                </p>
                <button
                  onClick={() => { if (scanPhase !== "scanning") { resetScan(); setShowScanSheet(false); } }}
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "rgba(239,159,39,0.08)", border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <X size={16} color="#8A7A52" />
                </button>
              </div>

              {/* Orb */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <GoldenOrb
                  size={72}
                  intensity={scanPhase === "scanning" ? "high" : scanPhase === "result" ? "medium" : "low"}
                />
              </div>

              {/* Idle state */}
              {scanPhase === "idle" && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  {scanError && (
                    <div style={{
                      background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.2)",
                      borderRadius: 14, padding: "12px 16px", marginBottom: 16,
                    }}>
                      <p style={{ fontSize: 13, color: "#E24B4A", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
                        {scanError}
                      </p>
                    </div>
                  )}
                  <p style={{
                    textAlign: "center", fontSize: 15, color: "var(--text-secondary)",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    lineHeight: 1.6, marginBottom: 24,
                  }}>
                    Hold your medication bottle in front of the camera and tap below.
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleScan}
                    style={{
                      width: "100%", padding: "16px",
                      background: "#EF9F27", color: "#0F0E09", border: "none",
                      borderRadius: 50, fontSize: 15, fontWeight: 600,
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      cursor: "pointer", boxShadow: "0 4px 20px rgba(239,159,39,0.35)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                  >
                    <ScanLine size={17} strokeWidth={2} />
                    Scan Medication
                  </motion.button>
                </motion.div>
              )}

              {/* Scanning state */}
              {scanPhase === "scanning" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ textAlign: "center" }}
                >
                  <p style={{
                    fontSize: 18, fontStyle: "italic", color: "var(--text-primary)",
                    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                    marginBottom: 8,
                  }}>
                    {scanStatus}
                  </p>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
                    Keep the bottle steady…
                  </p>
                </motion.div>
              )}

              {/* Result state */}
              {scanPhase === "result" && scanResult && (() => {
                const isMatch    = scanResult.status === "match";
                const isUncertain = scanResult.status === "uncertain";
                const isMismatch = scanResult.status === "mismatch";
                const matchedMed = scanResult.medication_name
                  ? meds.find((m) => m.name.toLowerCase() === scanResult.medication_name!.toLowerCase())
                  : null;

                const accent = isMatch ? "#4CAF82" : isMismatch ? "#E24B4A" : "#EF9F27";
                const accentBg = isMatch ? "rgba(76,175,130,0.08)" : isMismatch ? "rgba(226,75,74,0.08)" : "rgba(239,159,39,0.08)";
                const accentBorder = isMatch ? "rgba(76,175,130,0.2)" : isMismatch ? "rgba(226,75,74,0.2)" : "rgba(239,159,39,0.2)";

                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    {/* Result card */}
                    <div style={{
                      background: accentBg, border: `1px solid ${accentBorder}`,
                      borderRadius: 18, padding: "18px 18px", marginBottom: 14,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0 }} />
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: accent,
                          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                          letterSpacing: "0.12em", textTransform: "uppercase",
                        }}>
                          {isMatch ? "In Your Care Plan" : isMismatch ? "Not in Care Plan" : "Already Taken Today"}
                        </span>
                      </div>
                      {scanResult.medication_name && (
                        <p style={{
                          fontSize: 22, fontStyle: "italic", color: "var(--text-primary)",
                          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                          marginBottom: 4,
                        }}>
                          {scanResult.medication_name}
                        </p>
                      )}
                      {scanResult.dosage && (
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginBottom: 10 }}>
                          {scanResult.dosage}{scanResult.plan_slot ? ` · ${scanResult.plan_slot}` : ""}
                        </p>
                      )}
                      <p style={{
                        fontSize: 14, color: "var(--text-secondary)",
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        lineHeight: 1.6,
                      }}>
                        {scanResult.message}
                      </p>
                    </div>

                    {/* Safety notice */}
                    <p style={{
                      fontSize: 12, color: "var(--text-muted)",
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      lineHeight: 1.5, marginBottom: 16, paddingLeft: 4,
                    }}>
                      ⚕️ {scanResult.safety_notice}
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* Mark as taken — only if match and not yet taken */}
                      {isMatch && matchedMed && !matchedMed.taken_today && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            handleToggle(matchedMed.id, true);
                            resetScan();
                            setShowScanSheet(false);
                          }}
                          style={{
                            width: "100%", padding: "15px",
                            background: "#4CAF82", color: "#0F0E09", border: "none",
                            borderRadius: 50, fontSize: 14, fontWeight: 600,
                            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                            cursor: "pointer", boxShadow: "0 4px 16px rgba(76,175,130,0.3)",
                          }}
                        >
                          Mark as Taken
                        </motion.button>
                      )}
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={resetScan}
                        style={{
                          width: "100%", padding: "14px",
                          background: "transparent", color: "#EF9F27",
                          border: "1px solid rgba(239,159,39,0.3)",
                          borderRadius: 50, fontSize: 14, fontWeight: 600,
                          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        Scan Again
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Add medication bottom sheet ───────────────────────────────── */}
      <AnimatePresence>
        {showSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSheet(false)}
              style={{
                position: "fixed", inset: 0,
                background: "rgba(0,0,0,0.65)",
                zIndex: 100,
              }}
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{
                position: "fixed", bottom: 0, left: 0, right: 0,
                background: "var(--surface)",
                borderRadius: "24px 24px 0 0",
                padding: "24px 24px 48px",
                zIndex: 101,
                border: "1px solid rgba(239,159,39,0.15)",
                borderBottom: "none",
              }}
            >
              {/* Drag handle */}
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: "rgba(239,159,39,0.2)",
                margin: "0 auto 24px",
              }} />

              {/* Title row */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 24,
              }}>
                <p style={{
                  fontSize: 20, fontStyle: "italic", fontWeight: 400,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                }}>
                  Add Medication
                </p>
                <button
                  onClick={() => setShowSheet(false)}
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "rgba(239,159,39,0.08)",
                    border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <X size={16} color="#8A7A52" />
                </button>
              </div>

              {/* Fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Name */}
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginBottom: 6 }}>
                    Medication name *
                  </p>
                  <input
                    placeholder="e.g. Metformin"
                    value={newMed.name}
                    onChange={(e) => { setNewMed((p) => ({ ...p, name: e.target.value })); setFormError((f) => ({ ...f, name: undefined })); }}
                    style={{ ...INPUT, background: "var(--card)", border: `1px solid ${formError.name ? "#E24B4A" : "rgba(239,159,39,0.2)"}` }}
                  />
                  {formError.name && <p style={{ fontSize: 12, color: "#E24B4A", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginTop: 4 }}>{formError.name}</p>}
                </div>

                {/* Dosage */}
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginBottom: 6 }}>
                    Dosage
                  </p>
                  <input
                    placeholder="e.g. 500mg"
                    value={newMed.dosage}
                    onChange={(e) => setNewMed((p) => ({ ...p, dosage: e.target.value }))}
                    style={{ ...INPUT, background: "var(--card)" }}
                  />
                </div>

                {/* Time */}
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginBottom: 6 }}>
                    Time *
                  </p>
                  <input
                    type="time"
                    value={newMed.schedule}
                    onChange={(e) => { setNewMed((p) => ({ ...p, schedule: e.target.value })); setFormError((f) => ({ ...f, schedule: undefined })); }}
                    style={{ ...INPUT, background: "var(--card)", border: `1px solid ${formError.schedule ? "#E24B4A" : "rgba(239,159,39,0.2)"}`, colorScheme: "dark" }}
                  />
                  {formError.schedule && <p style={{ fontSize: 12, color: "#E24B4A", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginTop: 4 }}>{formError.schedule}</p>}
                </div>

                {/* Frequency chips */}
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginBottom: 10 }}>
                    Frequency
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/* Every day shortcut */}
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setNewMed((p) => ({ ...p, days: p.days.length === DAYS.length ? [] : [...DAYS] }))}
                      style={{
                        padding: "7px 14px", borderRadius: 30, fontSize: 13,
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 500,
                        border: newMed.days.length === DAYS.length ? "none" : "1px solid rgba(239,159,39,0.3)",
                        background: newMed.days.length === DAYS.length ? "#EF9F27" : "var(--card)",
                        color: newMed.days.length === DAYS.length ? "#0F0E09" : "var(--text-secondary)",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      Every day
                    </motion.button>
                    {DAYS.map((day) => {
                      const sel = newMed.days.includes(day);
                      return (
                        <motion.button
                          key={day}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setNewMed((p) => ({ ...p, days: sel ? p.days.filter((d) => d !== day) : [...p.days, day] }))}
                          style={{
                            padding: "7px 12px", borderRadius: 30, fontSize: 13,
                            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 500,
                            border: sel ? "none" : "1px solid rgba(239,159,39,0.2)",
                            background: sel ? "#EF9F27" : "var(--card)",
                            color: sel ? "#0F0E09" : "var(--text-secondary)",
                            cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          {day}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Save button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddMed}
                  disabled={saving}
                  style={{
                    width: "100%", padding: "16px", marginTop: 4,
                    background: "#EF9F27", color: "#0F0E09", border: "none",
                    borderRadius: 50, fontSize: 15, fontWeight: 600,
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving || !newMed.name.trim() || !newMed.schedule ? 0.4 : 1,
                    transition: "opacity 0.2s",
                    boxShadow: "0 4px 20px rgba(239,159,39,0.3)",
                  }}
                >
                  {saving ? "Saving…" : "Save Medication"}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </PageWrapper>
  );
}
