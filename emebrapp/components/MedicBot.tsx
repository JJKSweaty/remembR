"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type BotExpression = "happy" | "thinking" | "sad" | "celebrating";

export interface MedicBotProps {
  expression?: BotExpression;
  speaking?: string;
  size?: number;
}

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  body:   "#F7C1C1",
  face:   "#FCEBEB",
  accent: "#E24B4A",
  limbs:  "#F09595",
  ink:    "#A32D2D",
};

// ── Speech bubble ─────────────────────────────────────────────────────────────

function SpeechBubble({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const [visible, setVisible]     = useState(true);

  useEffect(() => {
    setDisplayed("");
    setVisible(true);
    let i = 0;
    const typeTimer    = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) clearInterval(typeTimer); }, 28);
    const dismissTimer = setTimeout(() => setVisible(false), text.length * 28 + 5000);
    return () => { clearInterval(typeTimer); clearTimeout(dismissTimer); };
  }, [text]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.94 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            position: "absolute",
            bottom: "calc(100% + 12px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "white",
            borderRadius: 16,
            padding: "12px 16px",
            boxShadow: "0 4px 20px rgba(226,75,74,0.15)",
            border: "1px solid #F7C1C1",
            maxWidth: 220,
            width: "max-content",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <p style={{
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontSize: 13,
            color: "#A32D2D",
            lineHeight: 1.5,
            margin: 0,
            whiteSpace: "pre-wrap",
          }}>
            {displayed}
          </p>
          <div style={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid white",
            filter: "drop-shadow(0 2px 1px rgba(226,75,74,0.08))",
          }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── MedicBot ──────────────────────────────────────────────────────────────────

export default function MedicBot({ expression = "happy", speaking, size = 120 }: MedicBotProps) {
  const isCelebrating = expression === "celebrating";
  const w = size;
  const h = Math.round(size * 1.35);

  return (
    <motion.div
      key={expression}
      initial={{ scale: 0.88 }}
      animate={{
        scale: 1,
        y: isCelebrating ? [0, -14, 0, -10, 0] : [0, -6, 0],
      }}
      transition={{
        scale: { type: "spring", stiffness: 380, damping: 22 },
        y: { duration: isCelebrating ? 0.75 : 2.2, repeat: Infinity, ease: "easeInOut" },
      }}
      style={{ width: w, height: h, position: "relative", display: "inline-block" }}
    >
      {speaking && <SpeechBubble key={speaking} text={speaking} />}

      <svg
        width={w}
        height={h}
        viewBox="0 0 120 162"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Antenna ────────────────────────────────────────────────── */}
        <rect x="57" y="13" width="6" height="12" rx="3" fill={C.limbs} />
        <circle cx="60" cy="10" r="8" fill={C.accent} />
        <line x1="60" y1="6"  x2="60" y2="14" stroke="white" strokeWidth="2"   strokeLinecap="round" />
        <line x1="56" y1="10" x2="64" y2="10" stroke="white" strokeWidth="2"   strokeLinecap="round" />

        {/* ── Head ───────────────────────────────────────────────────── */}
        <rect x="18" y="22" width="84" height="70" rx="16" fill={C.body} />

        {/* ── Face screen ────────────────────────────────────────────── */}
        <rect x="27" y="30" width="66" height="56" rx="10" fill={C.face} />

        {/* ── Eyes ───────────────────────────────────────────────────── */}
        {expression === "happy" && (
          <>
            <path d="M 39 56 Q 44 47 49 56" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M 71 56 Q 76 47 81 56" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        )}
        {expression === "thinking" && (
          <>
            <path d="M 39 56 Q 44 47 49 56" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <line x1="71" y1="51" x2="81" y2="51"           stroke={C.ink} strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
        {expression === "sad" && (
          <>
            <path d="M 39 50 Q 44 59 49 50" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M 71 50 Q 76 59 81 50" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        )}
        {expression === "celebrating" && (
          <>
            {/* Star / sparkle eyes ✦ */}
            <path d="M 44 50 L 44 44 M 41 47 L 47 47 M 42 45 L 46 49 M 42 49 L 46 45"
              stroke={C.accent} strokeWidth="2" strokeLinecap="round" />
            <path d="M 76 50 L 76 44 M 73 47 L 79 47 M 74 45 L 78 49 M 74 49 L 78 45"
              stroke={C.accent} strokeWidth="2" strokeLinecap="round" />
          </>
        )}

        {/* ── Mouth ──────────────────────────────────────────────────── */}
        {expression === "happy" && (
          <path d="M 44 70 Q 60 80 76 70" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
        {expression === "thinking" && (
          <path d="M 46 72 Q 52 74 58 72 Q 64 70 70 72" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
        {expression === "sad" && (
          <path d="M 44 76 Q 60 66 76 76" stroke={C.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
        {expression === "celebrating" && (
          <path d="M 42 70 Q 60 84 78 70" stroke={C.ink} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        )}

        {/* ── Thought bubble (thinking only) ─────────────────────────── */}
        {expression === "thinking" && (
          <>
            <circle cx="96" cy="36" r="3"   fill={C.face} stroke={C.limbs} strokeWidth="1.5" />
            <circle cx="104" cy="26" r="5"  fill={C.face} stroke={C.limbs} strokeWidth="1.5" />
            <circle cx="113" cy="15" r="7"  fill={C.face} stroke={C.limbs} strokeWidth="1.5" />
            <circle cx="110" cy="15" r="1.2" fill={C.limbs} />
            <circle cx="113" cy="15" r="1.2" fill={C.limbs} />
            <circle cx="116" cy="15" r="1.2" fill={C.limbs} />
          </>
        )}

        {/* ── Arms (rendered before body so body covers attachment) ───── */}
        <rect
          x="5" y="99" width="22" height="9" rx="5" fill={C.limbs}
          transform={isCelebrating ? "rotate(-65, 27, 103)" : undefined}
        />
        <rect
          x="93" y="99" width="22" height="9" rx="5" fill={C.limbs}
          transform={isCelebrating ? "rotate(65, 93, 103)" : undefined}
        />

        {/* ── Body (covers arm attachment joints) ────────────────────── */}
        <rect x="27" y="94" width="66" height="44" rx="14" fill={C.body} />

        {/* ── Heart ──────────────────────────────────────────────────── */}
        <path
          d="M 60 120 C 60 120, 50 113, 48 109 C 46 105, 48 101, 52 101 C 56 101, 58 105, 60 107 C 62 105, 64 101, 68 101 C 72 101, 74 105, 72 109 C 70 113, 60 120, 60 120 Z"
          fill={C.accent}
        />

        {/* ── Legs ───────────────────────────────────────────────────── */}
        <rect x="37" y="138" width="17" height="14" rx="7" fill={C.limbs} />
        <rect x="66" y="138" width="17" height="14" rx="7" fill={C.limbs} />
        {/* Feet */}
        <rect x="32" y="148" width="22" height="9" rx="5" fill={C.accent} />
        <rect x="66" y="148" width="22" height="9" rx="5" fill={C.accent} />

        {/* ── Celebrating confetti ────────────────────────────────────── */}
        {expression === "celebrating" && (
          <>
            <circle cx="12"  cy="28" r="3.5" fill={C.accent} />
            <circle cx="108" cy="22" r="2.5" fill={C.limbs}  />
            <circle cx="8"   cy="50" r="2"   fill={C.body} stroke={C.limbs} strokeWidth="1" />
            <circle cx="112" cy="48" r="3"   fill={C.accent} />
            <rect x="14"  y="68" width="5" height="5" rx="1.5" fill={C.limbs}  />
            <rect x="101" y="64" width="5" height="5" rx="1.5" fill={C.accent} />
          </>
        )}
      </svg>
    </motion.div>
  );
}
