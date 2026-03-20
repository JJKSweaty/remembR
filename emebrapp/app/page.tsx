"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";
import GoldenOrb from "@/components/GoldenOrb";
import PageWrapper from "@/components/PageWrapper";
import { getUserName } from "@/lib/memory";
import { parseTimeToDate, parseTimeToMinutes } from "@/lib/time";

interface Med {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
  taken_today: boolean;
}

// ── Med status ────────────────────────────────────────────────────────────────

function getMedStatus(med: Med, now: Date): "Upcoming" | "Due Now" | "Overdue" {
  const diffMin = (now.getTime() - parseTimeToDate(med.schedule).getTime()) / 60000;
  if (diffMin < -30) return "Upcoming";
  if (diffMin <= 30)  return "Due Now";
  return "Overdue";
}

// ── Pill icon ─────────────────────────────────────────────────────────────────

function PillIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="9" width="18" height="6" rx="3" stroke="#EF9F27" strokeWidth="1.8" />
      <line x1="12" y1="9" x2="12" y2="15" stroke="#EF9F27" strokeWidth="1.8" />
      <rect x="3" y="9" width="9" height="6" rx="3" fill="var(--primary-pale)" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [meds, setMeds]         = useState<Med[]>([]);

  const now      = new Date();
  const h        = now.getHours();
  const greeting = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  useEffect(() => {
    const local = getUserName();
    if (local) setUserName(local);
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => { const n = d?.profile?.name || d?.name || ""; if (n) setUserName(n); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/medications")
      .then((r) => r.json())
      .then((d) => setMeds((d.medications as Med[]) || []))
      .catch(() => {});
  }, []);

  const handleMarkTaken = async (medId: string) => {
    // Optimistic update — card animates out immediately
    setMeds((prev) => prev.map((m) => m.id === medId ? { ...m, taken_today: true } : m));
    try {
      await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: medId, taken_today: true }),
      });
    } catch {
      // Revert on failure
      setMeds((prev) => prev.map((m) => m.id === medId ? { ...m, taken_today: false } : m));
    }
  };

  const medsTaken  = meds.filter((m) => m.taken_today).length;
  const medsTotal  = meds.length;
  const allDone    = medsTotal > 0 && medsTaken === medsTotal;
  const hasOverdue = meds.some((m) => !m.taken_today && getMedStatus(m, now) === "Overdue");

  const previewMeds = meds
    .filter((m) => !m.taken_today)
    .sort((a, b) => parseTimeToMinutes(a.schedule) - parseTimeToMinutes(b.schedule))
    .slice(0, 2);

  // Arc geometry — 260×260 SVG, center at (130,130), orb center at (100,100) in 200px render
  const ARC_R    = 113;
  const ARC_CIRC = 2 * Math.PI * ARC_R;
  const arcPct   = medsTotal > 0 ? medsTaken / medsTotal : 0;

  return (
    <PageWrapper>
      <div style={{ padding: "0 24px 120px" }}>

        {/* ── Top bar ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          style={{
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--card-border)",
            marginBottom: 20,
          }}
        >
          <button
            onClick={() => router.push("/settings")}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "var(--primary-softest)",
              border: "2.5px solid var(--primary)",
              boxShadow: "0 0 0 3px rgba(186,117,23,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <span style={{
              fontSize: 15, fontWeight: 700, color: "var(--primary)",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              lineHeight: 1,
            }}>
              {(userName || "?")[0].toUpperCase()}
            </span>
          </button>

          <p style={{
            fontSize: 20,
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--text-primary)",
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            letterSpacing: "0.01em",
            lineHeight: 1,
          }}>
            ember
          </p>

          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "var(--primary-softest)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={18} color="var(--primary)" strokeWidth={2} />
            </div>
            {hasOverdue && (
              <span style={{
                position: "absolute", top: 5, right: 5,
                width: 8, height: 8, borderRadius: "50%",
                background: "#E24B4A",
                border: "1.5px solid white",
              }} />
            )}
          </div>
        </motion.div>

        {/* ── Hero: Orb + arc ring + greeting ────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0, ease: "easeOut" }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "28px 0 12px",
            marginBottom: 8,
          }}
        >
          {/* Orb with progress arc overlay */}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {/* Progress arc — absolutely centered on the orb */}
            {medsTotal > 0 && (
              <svg
                width={260} height={260}
                style={{ position: "absolute", left: -30, top: -30, pointerEvents: "none", overflow: "visible" }}
              >
                <g transform="rotate(-90 130 130)">
                  {/* Track ring */}
                  <circle
                    cx={130} cy={130} r={ARC_R}
                    fill="none" stroke="#FAE8C0" strokeWidth={3} opacity={0.7}
                  />
                  {/* Progress ring */}
                  <motion.circle
                    cx={130} cy={130} r={ARC_R}
                    fill="none"
                    stroke={allDone ? "#4CAF82" : "#EF9F27"}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray={ARC_CIRC}
                    initial={{ strokeDashoffset: ARC_CIRC }}
                    animate={{ strokeDashoffset: ARC_CIRC * (1 - arcPct) }}
                    transition={{ duration: 1.4, delay: 0.3, ease: "easeOut" }}
                  />
                </g>
              </svg>
            )}
            <GoldenOrb size={200} intensity="medium" />
          </div>

          {/* Greeting — split into muted label + dramatic name */}
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <p style={{
              fontSize: 13,
              fontWeight: 400,
              color: "#B8924A",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}>
              {greeting}
            </p>
            <h1 style={{
              fontSize: 38,
              fontWeight: 600,
              fontStyle: "italic",
              color: "#2D1A00",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              lineHeight: 1.05,
              marginBottom: 8,
            }}>
              {userName || "there"}
            </h1>
            <p style={{
              fontSize: 13,
              color: "#8A6A2A",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              letterSpacing: "0.01em",
            }}>
              {dateLabel}
            </p>
          </div>
        </motion.div>

        {/* ── Medications ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.65 }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 14,
          }}>
            <h2 style={{
              fontSize: 26,
              fontWeight: 600,
              fontStyle: "italic",
              color: "#2D1A00",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              lineHeight: 1,
            }}>
              Today&apos;s Medications
            </h2>
            <Link href="/meds" style={{
              fontSize: 13, fontWeight: 600, color: "var(--primary)",
              textDecoration: "none",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            }}>
              See All →
            </Link>
          </div>

          {/* Progress bar */}
          {medsTotal > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{
                  fontSize: 12, color: "var(--text-secondary)",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                }}>
                  {medsTaken} of {medsTotal} taken
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: allDone ? "#4CAF82" : "var(--primary)",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                }}>
                  {Math.round((medsTaken / medsTotal) * 100)}%
                </span>
              </div>
              <div style={{ height: 5, background: "#FAE8C0", borderRadius: 50, overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(medsTaken / medsTotal) * 100}%` }}
                  transition={{ duration: 0.9, ease: "easeOut", delay: 0.5 }}
                  style={{
                    height: "100%",
                    background: allDone ? "#4CAF82" : "#EF9F27",
                    borderRadius: 50,
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* All taken */}
            {previewMeds.length === 0 && medsTotal > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  background: "#FFFDF9",
                  borderRadius: 20,
                  padding: "32px 24px",
                  border: "1px solid #FAE8C0",
                  boxShadow: "0 4px 16px rgba(186,117,23,0.08)",
                  textAlign: "center",
                }}
              >
                <p style={{
                  fontSize: 26, fontWeight: 600, fontStyle: "italic", color: "#2D1A00",
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                  marginBottom: 8, lineHeight: 1.2,
                }}>
                  All done for today.
                </p>
                <p style={{ fontSize: 14, color: "#8A6A2A", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
                  Great job taking all your medications.
                </p>
              </motion.div>
            )}

            {/* No meds */}
            {medsTotal === 0 && (
              <div style={{
                background: "#FFFDF9", borderRadius: 20, padding: "32px 24px",
                border: "1px solid #FAE8C0", boxShadow: "0 4px 16px rgba(186,117,23,0.08)",
                textAlign: "center",
              }}>
                <p style={{
                  fontSize: 26, fontWeight: 600, fontStyle: "italic", color: "#2D1A00",
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                  marginBottom: 8, lineHeight: 1.2,
                }}>
                  No medications yet.
                </p>
                <p style={{ fontSize: 14, color: "#8A6A2A", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
                  Ask your caregiver to add some.
                </p>
              </div>
            )}

            {/* Med cards */}
            <AnimatePresence>
              {previewMeds.map((med, i) => {
                const status      = getMedStatus(med, now);
                const accentColor = status === "Overdue" ? "#BA7517" : "#EF9F27";
                const badgeBg     = status === "Overdue" ? "#BA7517" : status === "Due Now" ? "#EF9F27" : "#FAEEDA";
                const badgeColor  = status === "Overdue" ? "white"   : status === "Due Now" ? "white"   : "#8A6A2A";
                const actionable  = status === "Due Now" || status === "Overdue";

                return (
                  <motion.div
                    key={med.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 48, scale: 0.95 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ duration: 0.35, delay: i * 0.08 }}
                    style={{
                      background: "#FFFDF9",
                      borderRadius: 18,
                      border: "1px solid #FAE8C0",
                      boxShadow: "0 4px 16px rgba(186,117,23,0.08)",
                      display: "flex",
                      alignItems: "stretch",
                      overflow: "hidden",
                    }}
                  >
                    {/* Left accent bar */}
                    <div style={{ width: 4, flexShrink: 0, background: accentColor }} />

                    <div style={{
                      flex: 1, display: "flex", alignItems: "center",
                      gap: 14, padding: "18px 16px 18px 18px",
                    }}>
                      {/* Icon */}
                      <div style={{
                        width: 46, height: 46, borderRadius: 14,
                        background: "var(--primary-softest)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <PillIcon />
                      </div>

                      {/* Name + schedule */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 18, fontWeight: 700, color: "#2D1A00",
                          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                          marginBottom: 3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {med.name}
                        </p>
                        <p style={{
                          fontSize: 13, color: "#8A6A2A",
                          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        }}>
                          {med.dosage ? `${med.dosage} · ` : ""}{med.schedule}
                        </p>
                      </div>

                      {/* Right side: badge or take button */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        {status === "Overdue" ? (
                          <motion.span
                            animate={{ opacity: [1, 0.5, 1] }}
                            transition={{ duration: 1.4, repeat: Infinity }}
                            style={{
                              fontSize: 11, fontWeight: 700,
                              background: badgeBg, color: badgeColor,
                              padding: "5px 11px", borderRadius: 50,
                              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                              letterSpacing: "0.02em",
                            }}
                          >
                            Overdue
                          </motion.span>
                        ) : (
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            background: badgeBg, color: badgeColor,
                            padding: "5px 11px", borderRadius: 50,
                            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                            letterSpacing: "0.02em",
                          }}>
                            {status}
                          </span>
                        )}

                        {/* Take button — shown for Due Now and Overdue */}
                        {actionable && (
                          <motion.button
                            whileTap={{ scale: 0.94 }}
                            onClick={() => handleMarkTaken(med.id)}
                            style={{
                              background: "#EF9F27",
                              color: "white",
                              border: "none",
                              borderRadius: 50,
                              padding: "6px 14px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                              letterSpacing: "0.02em",
                              boxShadow: "0 2px 8px rgba(186,117,23,0.3)",
                            }}
                          >
                            ✓ Take
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>

      </div>
    </PageWrapper>
  );
}
