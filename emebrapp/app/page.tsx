"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Pill } from "lucide-react";
import GoldenOrb from "@/components/GoldenOrb";
import PageWrapper from "@/components/PageWrapper";
import { parseTimeToDate, parseTimeToMinutes } from "@/lib/time";
import { useTimeTheme } from "@/lib/useTimeTheme";

interface Med {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
  taken_today: boolean;
}

function getMedStatus(med: Med, now: Date): "Upcoming" | "Due Now" | "Overdue" {
  const diffMin = (now.getTime() - parseTimeToDate(med.schedule).getTime()) / 60000;
  if (diffMin < -30) return "Upcoming";
  if (diffMin <= 30)  return "Due Now";
  return "Overdue";
}

// ── Circular progress ring ─────────────────────────────────────────────────────

const RING_SIZE = 64;
const RING_R    = 26;
const RING_CIRC = 2 * Math.PI * RING_R;

function ProgressRing({ pct }: { pct: number }) {
  return (
    <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
        fill="none" stroke="rgba(239,159,39,0.15)" strokeWidth={5}
      />
      <motion.circle
        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
        fill="none"
        stroke="#EF9F27"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={RING_CIRC}
        initial={{ strokeDashoffset: RING_CIRC }}
        animate={{ strokeDashoffset: RING_CIRC * (1 - pct) }}
        transition={{ duration: 1.2, delay: 0.5, ease: "easeOut" }}
      />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [userName, setUserName]   = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [meds, setMeds]           = useState<Med[]>([]);

  const { theme: timeTheme, greeting } = useTimeTheme();

  const now       = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const n = (d?.profile?.name || d?.name || "").trim();
        setUserName(n || "Margaret");
      })
      .catch(() => setUserName("Margaret"))
      .finally(() => setNameLoaded(true));
  }, []);

  useEffect(() => {
    fetch("/api/medications")
      .then((r) => r.json())
      .then((d) => setMeds((d.medications as Med[]) || []))
      .catch(() => {});
  }, []);

  const handleMarkTaken = async (medId: string) => {
    setMeds((prev) => prev.map((m) => m.id === medId ? { ...m, taken_today: true } : m));
    try {
      await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: medId, taken_today: true }),
      });
    } catch {
      setMeds((prev) => prev.map((m) => m.id === medId ? { ...m, taken_today: false } : m));
    }
  };

  const medsTaken  = meds.filter((m) => m.taken_today).length;
  const medsTotal  = meds.length;
  const allDone    = medsTotal > 0 && medsTaken === medsTotal;
  const hasOverdue = meds.some((m) => !m.taken_today && getMedStatus(m, now) === "Overdue");
  const arcPct     = medsTotal > 0 ? medsTaken / medsTotal : 0;

  const nextMed = meds
    .filter((m) => !m.taken_today)
    .sort((a, b) => parseTimeToMinutes(a.schedule) - parseTimeToMinutes(b.schedule))[0] ?? null;

  // Arc geometry — 260×260 SVG
  const ARC_R    = 113;
  const ARC_CIRC = 2 * Math.PI * ARC_R;

  return (
    <PageWrapper>
      <div style={{ padding: "0 24px 120px" }}>

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          style={{
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(239,159,39,0.1)",
            marginBottom: 20,
          }}
        >
          <button
            onClick={() => router.push("/settings")}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(239,159,39,0.08)",
              border: "1.5px solid rgba(239,159,39,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <span style={{
              fontSize: 15, fontWeight: 600, color: "#EF9F27",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              lineHeight: 1,
            }}>
              {(userName || "M")[0].toUpperCase()}
            </span>
          </button>

          <p style={{
            fontSize: 20, fontWeight: 400, fontStyle: "italic",
            color: "var(--text-primary)",
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            letterSpacing: "0.01em", lineHeight: 1,
          }}>
            ember
          </p>

          <div style={{ width: 40 }} />
        </motion.div>

        {/* ── Orb — ambient glow bleeds into background ───────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            padding: "20px 0 0",
          }}
        >
          {/* Ambient light bleed — large soft radial emanating from orb */}
          <div style={{
            position: "absolute",
            top: -40,
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 420,
            background: "radial-gradient(ellipse at 50% 38%, rgba(239,159,39,0.28) 0%, rgba(239,159,39,0.10) 40%, rgba(239,159,39,0.02) 65%, transparent 75%)",
            pointerEvents: "none",
          }} />

          {/* Progress arc */}
          {medsTotal > 0 && (
            <svg
              width={260} height={260}
              style={{ position: "absolute", left: "50%", marginLeft: -130, top: -10, pointerEvents: "none", overflow: "visible" }}
            >
              <g transform="rotate(-90 130 130)">
                <circle cx={130} cy={130} r={ARC_R} fill="none" stroke="rgba(239,159,39,0.12)" strokeWidth={3} />
                <motion.circle
                  cx={130} cy={130} r={ARC_R}
                  fill="none"
                  stroke={allDone ? "#4CAF82" : "#EF9F27"}
                  strokeWidth={3.5} strokeLinecap="round"
                  strokeDasharray={ARC_CIRC}
                  initial={{ strokeDashoffset: ARC_CIRC }}
                  animate={{ strokeDashoffset: ARC_CIRC * (1 - arcPct) }}
                  transition={{ duration: 1.4, delay: 0.3, ease: "easeOut" }}
                />
              </g>
            </svg>
          )}

          <GoldenOrb size={200} intensity={timeTheme.orbIntensity} />
        </motion.div>

        {/* ── Greeting section ────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginTop: 20, marginBottom: 28 }}>

          {/* "GOOD MORNING •" small caps */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 10,
            }}
          >
            {greeting}&nbsp;•
          </motion.p>

          {/* Patient name — 52px bold serif cream */}
          {!nameLoaded ? (
            <div style={{
              height: 56,
              width: 160,
              borderRadius: 12,
              background: "rgba(239,159,39,0.08)",
              margin: "0 auto 8px",
              animation: "shimmer 1.6s ease-in-out infinite",
            }} />
          ) : (
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                lineHeight: 1.0,
                marginBottom: 8,
                letterSpacing: "-0.01em",
              }}
            >
              {userName}
            </motion.h1>
          )}

          {/* Day + date */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              letterSpacing: "0.01em",
            }}
          >
            {dateLabel}
          </motion.p>
        </div>

        {/* ── Medication hero card ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
          style={{
            background: "var(--card)",
            border: "1px solid rgba(239,159,39,0.15)",
            borderRadius: 24,
            boxShadow: "0 4px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(239,159,39,0.08)",
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {/* Top: count + ring */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
          }}>
            <div>
              <div style={{
                fontSize: 56,
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                fontWeight: 400,
                color: "#EF9F27",
                lineHeight: 1,
                marginBottom: 4,
              }}>
                {medsTaken}
              </div>
              <div style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              }}>
                of {medsTotal} taken
              </div>
            </div>
            <ProgressRing pct={arcPct} />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(239,159,39,0.1)", margin: "0 24px" }} />

          {/* Next med / empty state */}
          <div style={{ padding: "16px 24px" }}>
            <AnimatePresence mode="wait">
              {allDone ? (
                <motion.div
                  key="all-done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ textAlign: "center", padding: "8px 0" }}
                >
                  <p style={{
                    fontSize: 18, fontStyle: "italic",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                    marginBottom: 4,
                  }}>
                    All done for today.
                  </p>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
                    Great job taking all your medications.
                  </p>
                </motion.div>
              ) : nextMed ? (
                <motion.div
                  key={nextMed.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: 32 }}
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "rgba(239,159,39,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Pill size={16} color="#EF9F27" strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 15, fontWeight: 500, color: "var(--text-primary)",
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      marginBottom: 2,
                    }}>
                      {nextMed.name}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
                      {nextMed.schedule}{nextMed.dosage ? ` · ${nextMed.dosage}` : ""}
                    </p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleMarkTaken(nextMed.id)}
                    style={{
                      background: "#EF9F27",
                      color: "#0F0E09",
                      border: "none",
                      borderRadius: 30,
                      padding: "8px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      boxShadow: "0 2px 12px rgba(239,159,39,0.4)",
                      flexShrink: 0,
                    }}
                  >
                    Take
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ textAlign: "center", padding: "8px 0" }}
                >
                  <p style={{
                    fontSize: 18, fontStyle: "italic",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                    marginBottom: 12,
                  }}>
                    No medications scheduled
                  </p>
                  <Link href="/meds" style={{ textDecoration: "none" }}>
                    <motion.span
                      whileTap={{ scale: 0.96 }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "#EF9F27", color: "#0F0E09",
                        borderRadius: 30, padding: "8px 18px",
                        fontSize: 13, fontWeight: 600,
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      + Add Medication
                    </motion.span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── All done celebratory message ─────────────────────────── */}
        {allDone && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{
              textAlign: "center",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 18,
              fontStyle: "italic",
              fontWeight: 300,
              color: "var(--text-muted)",
              marginTop: 16,
            }}
          >
            All done for today ✦
          </motion.p>
        )}

      </div>
    </PageWrapper>
  );
}
