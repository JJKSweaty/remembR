"use client";

type OrbMood = "idle" | "scanning" | "found" | "concerned" | "happy" | "calm";

interface OrbProps {
  mood?: OrbMood;
  size?: number;
}

const configs: Record<OrbMood, { c1: string; c2: string; c3: string; anim: string; shape: string }> = {
  idle: {
    c1: "#f5c084", c2: "#e8956e", c3: "#f0d4a0",
    anim: "orb-idle 5s ease-in-out infinite",
    shape: "60% 40% 55% 45% / 50% 60% 40% 50%",
  },
  scanning: {
    c1: "#e8c070", c2: "#d4784a", c3: "#f5d890",
    anim: "orb-scan 3s ease-in-out infinite",
    shape: "50% 50% 50% 50%",
  },
  found: {
    c1: "#a8d4a0", c2: "#70b868", c3: "#c8ecca",
    anim: "orb-celebrate 0.8s ease both",
    shape: "55% 45% 50% 50% / 45% 55% 50% 50%",
  },
  concerned: {
    c1: "#b8cce8", c2: "#7898c4", c3: "#d4e4f4",
    anim: "orb-breathe 4s ease-in-out infinite",
    shape: "50% 50% 55% 45% / 55% 50% 50% 55%",
  },
  happy: {
    c1: "#f5d070", c2: "#e89840", c3: "#fce8a0",
    anim: "orb-celebrate 0.6s ease both, orb-idle 5s ease-in-out 0.6s infinite",
    shape: "55% 45% 50% 50% / 45% 55% 50% 50%",
  },
  calm: {
    c1: "#c8a8e0", c2: "#9870c0", c3: "#e0c8f4",
    anim: "orb-breathe 6s ease-in-out infinite",
    shape: "50% 50% 50% 50%",
  },
};

export default function Orb({ mood = "idle", size = 160 }: OrbProps) {
  const cfg = configs[mood] ?? configs.idle;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Outer glow */}
      <div style={{
        position: "absolute",
        inset: -size * 0.2,
        background: `radial-gradient(circle, ${cfg.c1}44 0%, transparent 70%)`,
        borderRadius: "50%",
        animation: "orb-idle 5s ease-in-out infinite",
        animationDelay: "0.3s",
      }} />

      {/* Scanning rings */}
      {mood === "scanning" && [0, 1, 2].map(i => (
        <div key={i} style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `1.5px solid ${cfg.c1}60`,
          animation: `ring-out 2.5s ease-out ${i * 0.7}s infinite`,
        }} />
      ))}

      {/* Core orb */}
      <div style={{
        width: size,
        height: size,
        background: `radial-gradient(ellipse at 35% 35%, ${cfg.c3} 0%, ${cfg.c1} 45%, ${cfg.c2} 100%)`,
        borderRadius: cfg.shape,
        animation: cfg.anim,
        boxShadow: `0 0 ${size * 0.4}px ${cfg.c1}60, 0 0 ${size * 0.2}px ${cfg.c2}30`,
        position: "relative",
        zIndex: 2,
        transition: "background 1s ease, box-shadow 1s ease",
      }} />
    </div>
  );
}
