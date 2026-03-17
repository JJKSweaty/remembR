"use client";

import { useState } from "react";

interface MedCardProps {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
  taken_today: boolean;
  onToggle: (id: string, taken: boolean) => void;
  animationDelay?: number;
}

function parseScheduleTime(timeStr: string): Date {
  const now = new Date();
  const [timePart, period] = timeStr.trim().split(" ");
  const [hStr, mStr] = timePart.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (period?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period?.toUpperCase() === "AM" && h === 12) h = 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
}

type Status = "taken" | "overdue" | "pending";

function getStatus(taken_today: boolean, schedule: string): Status {
  if (taken_today) return "taken";
  if (parseScheduleTime(schedule) < new Date()) return "overdue";
  return "pending";
}

export default function MedCard({
  id,
  name,
  dosage,
  schedule,
  taken_today,
  onToggle,
  animationDelay = 0,
}: MedCardProps) {
  const [flash, setFlash] = useState(false);
  const status = getStatus(taken_today, schedule);
  const isTaken = status === "taken";
  const isOverdue = status === "overdue";

  const handleTap = () => {
    if (!taken_today) {
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }
    onToggle(id, !taken_today);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "18px 0",
        borderBottom: "1px solid rgba(200,160,100,0.08)",
        opacity: isTaken ? 0.45 : 1,
        transition: "opacity 0.3s",
        animation: `fadeUp 0.4s ease ${animationDelay}s both`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: 22,
            fontWeight: 400,
            color: "#2a1a08",
            marginBottom: 4,
            textDecoration: isTaken ? "line-through" : "none",
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>
            {dosage} · {schedule}
          </span>
          {isOverdue && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#c84020",
                background: "rgba(220,100,60,0.08)",
                padding: "2px 7px",
                borderRadius: 20,
              }}
            >
              Overdue
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleTap}
        aria-label={taken_today ? "Mark as not taken" : "Mark as taken"}
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: isTaken
            ? "#a8c8a0"
            : isOverdue
              ? "rgba(220,100,60,0.08)"
              : "transparent",
          border: `1.5px solid ${
            isTaken
              ? "#a8c8a0"
              : isOverdue
                ? "rgba(220,100,60,0.35)"
                : "rgba(200,160,100,0.3)"
          }`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.25s",
          animation: flash ? "checkmark 0.4s ease both" : "none",
          flexShrink: 0,
        }}
      >
        {isTaken && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
    </div>
  );
}
