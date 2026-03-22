"use client";

import { motion } from "framer-motion";
import { parseTimeToDate } from "@/lib/time";

interface MedCardProps {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
  taken_today: boolean;
  onToggle: (id: string, taken: boolean) => void;
  animationDelay?: number;
}

type Status = "taken" | "overdue" | "pending";

function getStatus(taken_today: boolean, schedule: string): Status {
  if (taken_today) return "taken";
  if (parseTimeToDate(schedule) < new Date()) return "overdue";
  return "pending";
}

function PillIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="9" width="18" height="6" rx="3" stroke={color} strokeWidth="1.8" />
      <line x1="12" y1="9" x2="12" y2="15" stroke={color} strokeWidth="1.8" />
      <rect x="3" y="9" width="9" height="6" rx="3" fill={color} fillOpacity="0.15" />
    </svg>
  );
}

export default function MedCard({
  id, name, dosage, schedule, taken_today, onToggle, animationDelay = 0,
}: MedCardProps) {
  const status    = getStatus(taken_today, schedule);
  const isTaken   = status === "taken";
  const isOverdue = status === "overdue";

  const accentColor = isTaken ? "#4CAF82" : isOverdue ? "#BA7517" : "#EF9F27";
  const badgeBg     = isTaken ? "#4CAF82" : isOverdue ? "#BA7517" : "rgba(239,159,39,0.15)";
  const badgeColor  = isTaken || isOverdue ? "white" : "var(--text-secondary)";
  const badgeText   = isTaken ? "Taken" : isOverdue ? "Overdue" : "Upcoming";
  const iconColor   = isTaken ? "#4CAF82" : "#EF9F27";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isTaken ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, x: 40, scale: 0.97 }}
      transition={{ duration: 0.35, delay: animationDelay }}
      style={{
        background: isTaken ? "rgba(76,175,130,0.05)" : "var(--card)",
        borderRadius: 18,
        border: `1px solid ${isTaken ? "rgba(76,175,130,0.2)" : "var(--card-border)"}`,
        boxShadow: "0 4px 16px rgba(186,117,23,0.07)",
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      {/* Left accent bar */}
      <div style={{ width: 4, flexShrink: 0, background: accentColor, opacity: isTaken ? 0.5 : 1 }} />

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, padding: "18px 16px 18px 18px" }}>

        {/* Pill icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 13,
          background: isTaken ? "rgba(76,175,130,0.1)" : "var(--primary-softest)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <PillIcon color={iconColor} />
        </div>

        {/* Name + dosage/schedule */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 18, fontWeight: 700, color: "var(--text-primary)",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            marginBottom: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textDecoration: isTaken ? "line-through" : "none",
            opacity: isTaken ? 0.55 : 1,
          }}>
            {name}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
            {dosage ? `${dosage} · ` : ""}{schedule}
          </p>
        </div>

        {/* Right: badge + action */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          {isOverdue && !isTaken ? (
            <motion.span
              animate={{ opacity: [1, 0.45, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{
                fontSize: 11, fontWeight: 700,
                background: badgeBg, color: badgeColor,
                padding: "5px 11px", borderRadius: 50,
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                letterSpacing: "0.02em",
              }}
            >
              {badgeText}
            </motion.span>
          ) : (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: badgeBg, color: badgeColor,
              padding: "5px 11px", borderRadius: 50,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              letterSpacing: "0.02em",
            }}>
              {badgeText}
            </span>
          )}

          {/* Take button */}
          {!isTaken && (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => onToggle(id, true)}
              style={{
                background: "#EF9F27",
                color: "white",
                border: "none",
                borderRadius: 50,
                padding: "6px 14px",
                fontSize: 12, fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                letterSpacing: "0.02em",
                boxShadow: "0 2px 8px rgba(186,117,23,0.3)",
              }}
            >
              ✓ Take
            </motion.button>
          )}

          {/* Undo button */}
          {isTaken && (
            <button
              onClick={() => onToggle(id, false)}
              style={{
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid rgba(239,159,39,0.2)",
                borderRadius: 50,
                padding: "5px 10px",
                fontSize: 11, fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              }}
            >
              Undo
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
