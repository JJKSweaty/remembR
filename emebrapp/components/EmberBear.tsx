"use client";

import { motion, type TargetAndTransition } from "framer-motion";

type Mood = "happy" | "thinking" | "concerned" | "celebrating" | "idle";
type Size = "sm" | "md" | "lg";

interface EmberBearProps {
  mood?: Mood;
  size?: Size;
  className?: string;
}

const sizeMap: Record<Size, number> = {
  sm: 72,
  md: 144,
  lg: 216,
};

const bodyAnimation: Record<Mood, TargetAndTransition> = {
  idle: {
    scaleY: [1, 1.018, 1],
    scaleX: [1, 0.986, 1],
    transition: { duration: 4, repeat: Infinity, ease: "easeInOut" },
  },
  happy: {
    y: [0, -12, 0],
    transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" },
  },
  thinking: {
    rotate: [-2, 2, -2],
    transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
  },
  concerned: {
    x: [-4, 4, -4],
    transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
  },
  celebrating: {
    y: [0, -16, 0],
    rotate: [-4, 4, -4],
    transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" },
  },
};

// Ink and palette — warm, soft, exactly like the reference
const INK = "#4a3525";
const CREAM = "#f6edd8";
const CREAM_DARK = "#eedfc4";
const BELLY = "#faf5ec";
const EAR_PINK = "#f0b8a8";
const SAGE = "#b0bc96";
const SAGE_LIGHT = "#d4ddc4";

export default function EmberBear({ mood = "idle", size = "md", className = "" }: EmberBearProps) {
  const dim = sizeMap[size];

  // Happy/celebrating eyes are arc-shaped (^_^), others are dots
  const happyEyes = mood === "happy" || mood === "celebrating";
  const sadMouth = mood === "concerned";

  return (
    <motion.div
      className={`inline-flex items-end justify-center select-none ${className}`}
      style={{ width: dim, height: dim * (220 / 180) }}
      animate={bodyAnimation[mood]}
    >
      <svg
        width={dim}
        height={Math.round(dim * (220 / 180))}
        viewBox="0 0 180 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── GROUND SHADOW ── */}
        <ellipse cx="90" cy="216" rx="34" ry="5" fill={INK} opacity="0.06" />

        {/* ── LEGS ── */}
        <rect x="58" y="174" width="28" height="36" rx="14" fill={CREAM_DARK} />
        <rect x="94" y="174" width="28" height="36" rx="14" fill={CREAM_DARK} />
        <rect x="58" y="174" width="28" height="36" rx="14" stroke={INK} strokeWidth="1.6" fill="none" />
        <rect x="94" y="174" width="28" height="36" rx="14" stroke={INK} strokeWidth="1.6" fill="none" />

        {/* ── BODY ── */}
        {/* Body fill */}
        <path
          d="M52 108 Q46 120 46 150 Q46 178 90 180 Q134 178 134 150 Q134 120 128 108 Q114 98 90 98 Q66 98 52 108 Z"
          fill={CREAM}
        />

        {/* Sweater / belly area */}
        <ellipse cx="90" cy="144" rx="26" ry="30" fill={BELLY} />

        {/* Diamond pattern on belly — argyle style */}
        {/* Horizontal center row */}
        <path d="M90 126 L98 136 L90 146 L82 136 Z" fill={SAGE_LIGHT} stroke={SAGE} strokeWidth="1" strokeLinejoin="round" />
        {/* Upper left */}
        <path d="M74 126 L82 136 L74 146 L66 136 Z" fill="none" stroke={SAGE} strokeWidth="0.9" strokeLinejoin="round" opacity="0.6" />
        {/* Upper right */}
        <path d="M106 126 L114 136 L106 146 L98 136 Z" fill="none" stroke={SAGE} strokeWidth="0.9" strokeLinejoin="round" opacity="0.6" />
        {/* Row below */}
        <path d="M90 146 L98 156 L90 166 L82 156 Z" fill={SAGE_LIGHT} stroke={SAGE} strokeWidth="1" strokeLinejoin="round" opacity="0.7" />

        {/* Body outline */}
        <path
          d="M52 108 Q46 120 46 150 Q46 178 90 180 Q134 178 134 150 Q134 120 128 108 Q114 98 90 98 Q66 98 52 108 Z"
          stroke={INK}
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />

        {/* ── ARMS ── */}
        {/* Left arm */}
        <path d="M52 120 Q36 118 32 136 Q30 150 46 155 Q56 158 58 145" fill={CREAM} />
        <path d="M52 120 Q36 118 32 136 Q30 150 46 155 Q56 158 58 145" stroke={INK} strokeWidth="1.6" strokeLinecap="round" fill="none" />

        {/* Right arm */}
        <path d="M128 120 Q144 118 148 136 Q150 150 134 155 Q124 158 122 145" fill={CREAM} />
        <path d="M128 120 Q144 118 148 136 Q150 150 134 155 Q124 158 122 145" stroke={INK} strokeWidth="1.6" strokeLinecap="round" fill="none" />

        {/* ── NECK ── */}
        <ellipse cx="90" cy="100" rx="22" ry="8" fill={CREAM} />

        {/* ── HEAD ── */}
        {/* Head fill */}
        <circle cx="90" cy="66" r="52" fill={CREAM} />
        {/* Head outline */}
        <circle cx="90" cy="66" r="52" stroke={INK} strokeWidth="1.8" fill="none" />

        {/* ── EARS ── */}
        {/* Left ear fill */}
        <circle cx="46" cy="24" r="18" fill={CREAM} />
        <circle cx="46" cy="24" r="18" stroke={INK} strokeWidth="1.8" fill="none" />
        <circle cx="46" cy="24" r="10" fill={EAR_PINK} opacity="0.7" />

        {/* Right ear fill */}
        <circle cx="134" cy="24" r="18" fill={CREAM} />
        <circle cx="134" cy="24" r="18" stroke={INK} strokeWidth="1.8" fill="none" />
        <circle cx="134" cy="24" r="10" fill={EAR_PINK} opacity="0.7" />

        {/* ── EYES ── */}
        {happyEyes ? (
          <>
            {/* Curved happy eyes  ^  ^ */}
            <path d="M72 68 Q79 60 86 68" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M94 68 Q101 60 108 68" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            {/* Dot eyes */}
            <motion.g
              style={{ originX: 79, originY: 68 }}
              animate={mood === "idle" ? {
                scaleY: [1, 0.05, 1],
                transition: { duration: 0.12, repeat: Infinity, repeatDelay: 5.5 }
              } : {}}
            >
              <circle cx="79" cy="68" r="5.5" fill={INK} />
              <circle cx="81" cy="65.5" r="1.8" fill="white" opacity="0.65" />
            </motion.g>
            <motion.g
              style={{ originX: 101, originY: 68 }}
              animate={mood === "idle" ? {
                scaleY: [1, 0.05, 1],
                transition: { duration: 0.12, repeat: Infinity, repeatDelay: 5.5 }
              } : {}}
            >
              <circle cx="101" cy="68" r="5.5" fill={INK} />
              <circle cx="103" cy="65.5" r="1.8" fill="white" opacity="0.65" />
            </motion.g>
          </>
        )}

        {/* ── NOSE ── */}
        <ellipse cx="90" cy="80" rx="6" ry="4.5" fill={INK} />

        {/* ── MOUTH ── */}
        {sadMouth ? (
          /* Sad — slight frown */
          <path d="M82 90 Q90 86 98 90" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        ) : happyEyes ? (
          /* Big happy smile */
          <path d="M80 88 Q90 98 100 88" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
        ) : (
          /* Default gentle smile */
          <path d="M83 88 Q90 93 97 88" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        )}

        {/* ── THINKING BUBBLES ── */}
        {mood === "thinking" && (
          <>
            <motion.circle cx="148" cy="52" r="4"
              stroke={INK} strokeWidth="1.4" fill={CREAM}
              animate={{ opacity: [0, 1, 0], y: [2, 0, 2] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: 0 }}
            />
            <motion.circle cx="158" cy="36" r="5.5"
              stroke={INK} strokeWidth="1.4" fill={CREAM}
              animate={{ opacity: [0, 1, 0], y: [2, 0, 2] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: 0.35 }}
            />
            <motion.circle cx="169" cy="18" r="7"
              stroke={INK} strokeWidth="1.4" fill={CREAM}
              animate={{ opacity: [0, 1, 0], y: [2, 0, 2] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: 0.7 }}
            />
          </>
        )}

        {/* ── CELEBRATING — little stars ── */}
        {mood === "celebrating" && (
          <>
            <motion.g
              animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: 0 }}
              style={{ originX: "24px", originY: "60px" }}
            >
              {/* 4-point star */}
              <path d="M24 52 L26.5 58 L33 60 L26.5 62 L24 68 L21.5 62 L15 60 L21.5 58 Z"
                fill={SAGE_LIGHT} stroke={SAGE} strokeWidth="1.2" strokeLinejoin="round" />
            </motion.g>
            <motion.g
              animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: 0.3 }}
              style={{ originX: "156px", originY: "60px" }}
            >
              <path d="M156 52 L158.5 58 L165 60 L158.5 62 L156 68 L153.5 62 L147 60 L153.5 58 Z"
                fill="#f8d4c0" stroke="#e09878" strokeWidth="1.2" strokeLinejoin="round" />
            </motion.g>
            <motion.circle cx="22" cy="36" r="3"
              fill={SAGE} opacity="0.7"
              animate={{ scale: [0, 1, 0], opacity: [0, 0.7, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: 0.15 }}
            />
            <motion.circle cx="158" cy="38" r="3"
              fill="#e09878" opacity="0.7"
              animate={{ scale: [0, 1, 0], opacity: [0, 0.7, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: 0.5 }}
            />
          </>
        )}
      </svg>
    </motion.div>
  );
}
