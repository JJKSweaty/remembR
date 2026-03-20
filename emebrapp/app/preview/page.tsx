"use client";

import { NavBar } from "@/components/BottomNav";

const STATES = [
  { activeTab: "home" as const, label: "Home active" },
  { activeTab: "meds" as const, label: "Meds active" },
  { activeTab: "chat" as const, label: "Chat active" },
  { activeTab: "find" as const, label: "Find active" },
];

export default function Preview() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0F0E09",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: "48px 24px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontSize: 22,
          fontWeight: 500,
          color: "#3C2A10",
          margin: 0,
          letterSpacing: "0.01em",
          opacity: 0.6,
        }}
      >
        Bottom Nav — All States
      </h1>

      {STATES.map(({ activeTab, label }, i) => (
        <div
          key={activeTab}
          style={{
            width: 390,
            height: 200,
            background: "#1A1808",
            borderRadius: 32,
            boxShadow: "0 12px 48px rgba(0,0,0,0.12)",
            position: "relative",
            overflow: "visible",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "0 0 20px",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 20,
              left: 24,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 500,
              color: "#C4A882",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
          <div style={{ padding: "0 24px" }}>
            <NavBar
              activeTab={activeTab}
              layoutPrefix={`preview-${i}-`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
