"use client";

import { useId, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type OrbMood = "idle" | "happy" | "concerned" | "listening" | "found";

export interface EmberOrbProps {
  mood?: OrbMood;
  speaking?: string;
  size?: number;
}

// ── Speech Bubble ─────────────────────────────────────────────────────────────

function SpeechBubble({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setDisplayed("");
    setVisible(true);
    let i = 0;
    const typeTimer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(typeTimer);
    }, 30);
    const dismissTimer = setTimeout(() => setVisible(false), text.length * 30 + 4000);
    return () => { clearInterval(typeTimer); clearTimeout(dismissTimer); };
  }, [text]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            position: "absolute",
            bottom: "calc(100% + 14px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--card)",
            borderRadius: 16,
            padding: "12px 16px",
            boxShadow: "var(--card-shadow)",
            border: "1px solid var(--card-border)",
            maxWidth: 220,
            width: "max-content",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <p style={{
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontSize: 13,
            color: "var(--text-primary)",
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
            borderTop: "8px solid var(--card)",
            filter: "drop-shadow(0 2px 1px rgba(45,90,61,0.06))",
          }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Mood config ───────────────────────────────────────────────────────────────

interface GradStop { offset: string; color: string }

interface MoodCfg {
  stops: GradStop[];
  glowInner: string;
  glowOuter: string;
  baseFreqMin: number;
  baseFreqMax: number;
  turbDur: number;
  dispScale: number;
  floatDur: number;
  floatAmp: number;
  driftDur: number;
}

const MOOD: Record<OrbMood, MoodCfg> = {
  idle: {
    stops: [
      { offset: "0%",   color: "#D4F0D8" },
      { offset: "28%",  color: "#7BC47F" },
      { offset: "65%",  color: "#3D7A52" },
      { offset: "100%", color: "#1F4029" },
    ],
    glowInner: "rgba(61,122,82,0.22)",
    glowOuter: "rgba(61,122,82,0.08)",
    baseFreqMin: 0.015,
    baseFreqMax: 0.025,
    turbDur: 8,
    dispScale: 18,
    floatDur: 3,
    floatAmp: 8,
    driftDur: 5,
  },
  happy: {
    stops: [
      { offset: "0%",   color: "#EDFAE8" },
      { offset: "28%",  color: "#A8D5A2" },
      { offset: "65%",  color: "#5CB870" },
      { offset: "100%", color: "#3D7A52" },
    ],
    glowInner: "rgba(92,168,112,0.28)",
    glowOuter: "rgba(92,168,112,0.1)",
    baseFreqMin: 0.02,
    baseFreqMax: 0.035,
    turbDur: 5,
    dispScale: 22,
    floatDur: 1.5,
    floatAmp: 10,
    driftDur: 3,
  },
  concerned: {
    stops: [
      { offset: "0%",   color: "#D0E8F0" },
      { offset: "28%",  color: "#6A9AAA" },
      { offset: "65%",  color: "#4A7C8A" },
      { offset: "100%", color: "#2A5A68" },
    ],
    glowInner: "rgba(74,124,138,0.22)",
    glowOuter: "rgba(74,124,138,0.08)",
    baseFreqMin: 0.01,
    baseFreqMax: 0.018,
    turbDur: 12,
    dispScale: 14,
    floatDur: 4,
    floatAmp: 5,
    driftDur: 7,
  },
  listening: {
    stops: [
      { offset: "0%",   color: "#D4F0D8" },
      { offset: "28%",  color: "#7BC47F" },
      { offset: "65%",  color: "#3D7A52" },
      { offset: "100%", color: "#1F4029" },
    ],
    glowInner: "rgba(61,122,82,0.28)",
    glowOuter: "rgba(61,122,82,0.1)",
    baseFreqMin: 0.015,
    baseFreqMax: 0.025,
    turbDur: 8,
    dispScale: 18,
    floatDur: 3,
    floatAmp: 8,
    driftDur: 5,
  },
  found: {
    stops: [
      { offset: "0%",   color: "#FFFFFF" },
      { offset: "22%",  color: "#B8F0C8" },
      { offset: "60%",  color: "#4CAF82" },
      { offset: "100%", color: "#2D5A3D" },
    ],
    glowInner: "rgba(76,175,130,0.35)",
    glowOuter: "rgba(76,175,130,0.12)",
    baseFreqMin: 0.02,
    baseFreqMax: 0.03,
    turbDur: 4,
    dispScale: 20,
    floatDur: 2,
    floatAmp: 6,
    driftDur: 4,
  },
};

// ── EmberOrb ──────────────────────────────────────────────────────────────────

export default function EmberOrb({ mood = "idle", speaking, size = 120 }: EmberOrbProps) {
  const uid = useId();
  const filterId = `eorb-f${uid}`;
  const gradId   = `eorb-g${uid}`;
  const blurId   = `eorb-b${uid}`;

  const cfg = MOOD[mood];
  const halo = size * 2.5;   // 300px for default 120px orb
  const r = Math.round(size * 0.43); // circle radius inside 120-viewBox SVG
  const cx = 60;
  const cy = 60;

  return (
    <div style={{
      position: "relative",
      width: halo,
      height: halo,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      {/* Outer halo — soft radial fade */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${cfg.glowInner} 0%, ${cfg.glowOuter} 40%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Breathing inner glow */}
      <motion.div
        animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: size * 1.4,
          height: size * 1.4,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${cfg.glowInner} 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

      {/* Listening ripple rings */}
      {mood === "listening" && [0, 1, 2].map((i) => (
        <motion.div
          key={i}
          initial={{ scale: 0.5, opacity: 0.5 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.65, ease: "easeOut" }}
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: "50%",
            border: "2px solid rgba(61,122,82,0.4)",
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Floating orb — float + drift + rotation */}
      <motion.div
        key={mood}
        initial={mood === "found" ? { scale: 1.4, opacity: 0.5 } : { scale: 1, opacity: 1 }}
        animate={{
          scale: 1,
          opacity: 1,
          y: [0, -cfg.floatAmp, 0, cfg.floatAmp, 0],
          x: [0, -5, 0, 5, 0],
          rotate: [0, -5, 0, 5, 0],
        }}
        transition={{
          scale:   { duration: 0.5, ease: "easeOut" },
          opacity: { duration: 0.4 },
          y:       { duration: cfg.floatDur, repeat: Infinity, ease: "easeInOut" },
          x:       { duration: cfg.driftDur, repeat: Infinity, ease: "easeInOut" },
          rotate:  { duration: 6, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{ position: "relative", zIndex: 2 }}
      >
        {/* Speech bubble floats with the orb */}
        {speaking && <SpeechBubble key={speaking} text={speaking} />}

        {/* SVG orb with organic turbulence */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            {/* Soft blur for specular highlight */}
            <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>

            {/* Turbulence displacement — gives organic blob edge */}
            <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%">
              <feTurbulence
                type="turbulence"
                baseFrequency={cfg.baseFreqMin}
                numOctaves={3}
                seed={2}
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  values={`${cfg.baseFreqMin};${cfg.baseFreqMax};${cfg.baseFreqMin}`}
                  dur={`${cfg.turbDur}s`}
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={cfg.dispScale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>

            {/* Main radial gradient — bright center, deep outer */}
            <radialGradient id={gradId} cx="38%" cy="32%" r="65%">
              {cfg.stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </radialGradient>
          </defs>

          {/* Main orb circle — distorted into organic blob */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={`url(#${gradId})`}
            filter={`url(#${filterId})`}
          />

          {/* Specular highlight — top-left inner glow */}
          <ellipse
            cx={47}
            cy={41}
            rx={16}
            ry={12}
            fill="rgba(255,255,255,0.18)"
            filter={`url(#${blurId})`}
          />
        </svg>
      </motion.div>
    </div>
  );
}
