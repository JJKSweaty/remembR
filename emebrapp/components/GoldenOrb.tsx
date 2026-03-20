"use client";

export type OrbIntensity = "low" | "medium" | "high";

export interface GoldenOrbProps {
  size?: number;
  intensity?: OrbIntensity;
  className?: string;
}

// ── CSS keyframes ─────────────────────────────────────────────────────────────
// Each blob drifts on its own slow orbit. The turbulence seed animates for
// living texture. Outer / mid / core glows pulse independently.

const KEYFRAMES = `
  /* ── Blob orbits ── */
  @keyframes gBlob1 {
    0%,100% { cx:68; cy:60; }
    25%     { cx:76; cy:54; }
    50%     { cx:72; cy:68; }
    75%     { cx:60; cy:58; }
  }
  @keyframes gBlob2 {
    0%,100% { cx:58; cy:70; }
    33%     { cx:50; cy:62; }
    66%     { cx:64; cy:78; }
  }
  @keyframes gBlob3 {
    0%,100% { cx:75; cy:68; }
    40%     { cx:66; cy:76; }
    70%     { cx:80; cy:60; }
  }
  @keyframes gBlob4 {
    0%,100% { cx:55; cy:55; }
    50%     { cx:62; cy:48; }
  }
  @keyframes gBlob5 {
    0%,100% { cx:70; cy:74; }
    35%     { cx:60; cy:80; }
    65%     { cx:76; cy:68; }
  }

  /* ── Glow pulse — three layers, different speeds ── */
  @keyframes gAtmos {
    0%,100% { opacity: 0.18; }
    50%     { opacity: 0.28; }
  }
  @keyframes gMidGlow {
    0%,100% { opacity: 0.55; }
    50%     { opacity: 0.75; }
  }
  @keyframes gCoreGlow {
    0%,100% { opacity: 0.90; }
    50%     { opacity: 1.00; }
  }

  /* ── Specular drift ── */
  @keyframes gSpec {
    0%,100% { transform: translate(0px,   0px);   }
    30%     { transform: translate(-2px, -1.5px); }
    60%     { transform: translate(-1px, -2.5px); }
    80%     { transform: translate(-0.5px,-1px);  }
  }

  /* ── Outer breathing ── */
  @keyframes gBreathe {
    0%,100% { transform: scale(1);    }
    50%     { transform: scale(1.055);}
  }

  /* ── Particle drifts ── */
  @keyframes gP1 {
    0%,100% { transform:translate(0px,0px);   opacity:0.50; }
    50%     { transform:translate(5px,-6px);  opacity:0.80; }
  }
  @keyframes gP2 {
    0%,100% { transform:translate(0px,0px);   opacity:0.40; }
    40%     { transform:translate(-4px,5px);  opacity:0.70; }
  }
  @keyframes gP3 {
    0%,100% { transform:translate(0px,0px);   opacity:0.55; }
    60%     { transform:translate(6px,4px);   opacity:0.85; }
  }
  @keyframes gP4 {
    0%,100% { transform:translate(0px,0px);   opacity:0.35; }
    45%     { transform:translate(-5px,-4px); opacity:0.60; }
  }
  @keyframes gP5 {
    0%,100% { transform:translate(0px,0px);   opacity:0.45; }
    55%     { transform:translate(4px,-5px);  opacity:0.75; }
  }

  /* SVG transform-origin */
  .gorb-breathe { transform-box:fill-box; transform-origin:center center; }
  .gorb-spec    { transform-box:fill-box; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function GoldenOrb({ size = 200, intensity = "medium", className }: GoldenOrbProps) {
  // Speed multiplier — low=slower (×2), medium=×1, high=faster (×0.7)
  const s = intensity === "low" ? 2 : intensity === "high" ? 0.7 : 1;
  const a = (name: string, dur: number, delay = 0, easing = "ease-in-out") =>
    `${name} ${(dur * s).toFixed(2)}s ${easing} ${(delay * s).toFixed(2)}s infinite`;

  const w = size;
  const h = Math.round(size * 140 / 130);

  return (
    <div className={className} style={{ width: w, height: h, display: "inline-block", position: "relative" }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <svg
        width={w} height={h}
        viewBox="0 0 130 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {/* ── Blob mesh gradients — each off-center, overlap = mesh effect ── */}

          {/* Blob 1 — warm gold, drifts upper-right */}
          <radialGradient id="gB1" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#EF9F27" stopOpacity="0.95" />
            <stop offset="60%"  stopColor="#EF9F27" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#EF9F27" stopOpacity="0"    />
          </radialGradient>

          {/* Blob 2 — pale cream, drifts lower-left */}
          <radialGradient id="gB2" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FAEEDA" stopOpacity="0.90" />
            <stop offset="55%"  stopColor="#FAC775" stopOpacity="0.50" />
            <stop offset="100%" stopColor="#FAC775" stopOpacity="0"    />
          </radialGradient>

          {/* Blob 3 — deep amber, drifts right */}
          <radialGradient id="gB3" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#BA7517" stopOpacity="0.70" />
            <stop offset="50%"  stopColor="#EF9F27" stopOpacity="0.40" />
            <stop offset="100%" stopColor="#EF9F27" stopOpacity="0"    />
          </radialGradient>

          {/* Blob 4 — bright highlight, drifts upper-left */}
          <radialGradient id="gB4" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FFFEF0" stopOpacity="1.00" />
            <stop offset="45%"  stopColor="#FAD070" stopOpacity="0.70" />
            <stop offset="100%" stopColor="#FAD070" stopOpacity="0"    />
          </radialGradient>

          {/* Blob 5 — warm mid-gold, drifts lower-right */}
          <radialGradient id="gB5" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FAC775" stopOpacity="0.80" />
            <stop offset="60%"  stopColor="#EF9F27" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#EF9F27" stopOpacity="0"    />
          </radialGradient>

          {/* ── Atmosphere glow — 3 concentric, independently pulsing ── */}

          {/* Outer atmosphere: 3× orb radius, very soft */}
          <radialGradient id="gAtmos" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#EF9F27" stopOpacity="0.22" />
            <stop offset="50%"  stopColor="#FAC775" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#FAEEDA" stopOpacity="0"    />
          </radialGradient>

          {/* Mid glow: 1.5× orb radius */}
          <radialGradient id="gMid" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FAD070" stopOpacity="0.60" />
            <stop offset="65%"  stopColor="#EF9F27" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#EF9F27" stopOpacity="0"    />
          </radialGradient>

          {/* Core glow: tight inner light */}
          <radialGradient id="gCore" cx="45%" cy="42%" r="55%">
            <stop offset="0%"   stopColor="#FFFEF0" stopOpacity="1"    />
            <stop offset="35%"  stopColor="#FAD070" stopOpacity="0.90" />
            <stop offset="70%"  stopColor="#EF9F27" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#C87820" stopOpacity="0.60" />
          </radialGradient>

          {/* Specular highlight — top-left diffuse lens shine */}
          <radialGradient id="gSpec" cx="30%" cy="25%" r="70%">
            <stop offset="0%"   stopColor="white" stopOpacity="0.75" />
            <stop offset="40%"  stopColor="white" stopOpacity="0.30" />
            <stop offset="100%" stopColor="white" stopOpacity="0"    />
          </radialGradient>

          {/* Bottom-right shadow — adds sphere curvature */}
          <radialGradient id="gShadow" cx="75%" cy="78%" r="50%">
            <stop offset="0%"   stopColor="#7A4500" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#7A4500" stopOpacity="0"    />
          </radialGradient>

          {/* Noise / texture filter */}
          <filter id="gNoise" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="in" />
          </filter>

          {/* Clip path — keeps everything inside the orb circle */}
          <clipPath id="gClip">
            <circle cx="65" cy="65" r="26" />
          </clipPath>
          <clipPath id="gClipMid">
            <circle cx="65" cy="65" r="34" />
          </clipPath>
        </defs>

        {/* ── Ground shadow ──────────────────────────────────────────── */}
        <ellipse cx={65} cy={78} rx={28} ry={5} fill="#BA7517" opacity={0.05} />

        {/* ── Outer atmosphere — breathing, 3× size ─────────────────── */}
        <g className="gorb-breathe" style={{ animation: a("gBreathe", 4) }}>
          <circle cx={65} cy={65} r={65} fill="url(#gAtmos)"
            style={{ animation: a("gAtmos", 5, 0) }} />
        </g>

        {/* ── Mid glow ─────────────────────────────────────────────────── */}
        <circle cx={65} cy={65} r={46} fill="url(#gMid)"
          style={{ animation: a("gMidGlow", 3.5, 0.8) }} />

        {/* ── Core body — mesh gradient blobs ──────────────────────────── */}
        {/* Base fill so there's no gap between blobs */}
        <circle cx={65} cy={65} r={28} fill="#EF9F27" />

        {/* Blob 1 — warm gold */}
        <circle r={22} fill="url(#gB1)" style={{ animation: a("gBlob1", 7, 0) }} />
        {/* Blob 2 — cream drift lower-left */}
        <circle r={20} fill="url(#gB2)" style={{ animation: a("gBlob2", 9, 1.2) }} />
        {/* Blob 3 — deep amber drift right */}
        <circle r={16} fill="url(#gB3)" style={{ animation: a("gBlob3", 8, 0.6) }} />
        {/* Blob 4 — bright highlight drift upper-left */}
        <circle r={14} fill="url(#gB4)" style={{ animation: a("gBlob4", 6, 0.3) }} />
        {/* Blob 5 — warm mid drift lower-right */}
        <circle r={18} fill="url(#gB5)" style={{ animation: a("gBlob5", 10, 1.8) }} />

        {/* ── Core glow on top of blobs ─────────────────────────────── */}
        <circle cx={65} cy={65} r={26} fill="url(#gCore)"
          style={{ animation: a("gCoreGlow", 2.8, 0.5) }} />

        {/* ── Noise texture overlay — organic, not digital ─────────────── */}
        <circle cx={65} cy={65} r={28} fill="transparent"
          filter="url(#gNoise)" opacity={0.04} />

        {/* ── Bottom-right sphere shadow ───────────────────────────── */}
        <circle cx={65} cy={65} r={28} fill="url(#gShadow)" />

        {/* ── Specular highlight ─────────────────────────────────────── */}
        <ellipse
          cx={58} cy={54} rx={12} ry={10}
          fill="url(#gSpec)"
          className="gorb-spec"
          style={{ animation: a("gSpec", 5, 0.4) }}
        />

        {/* Tiny sharp specular peak — the "catch light" */}
        <circle cx={57} cy={52} r={2.5} fill="white" opacity={0.55} />

        {/* ── Particles — gold dust in outer aura ──────────────────── */}
        <circle cx={93} cy={31}  r={1.4} fill="#FAC775" opacity={0.7} style={{ animation: a("gP1", 4.5, 0.2) }} />
        <circle cx={110} cy={72} r={1.6} fill="#EF9F27" opacity={0.6} style={{ animation: a("gP2", 5.5, 0.9) }} />
        <circle cx={82} cy={104} r={1.9} fill="#FAC775" opacity={0.5} style={{ animation: a("gP3", 6,   1.4) }} />
        <circle cx={34} cy={102} r={2.1} fill="#EF9F27" opacity={0.6} style={{ animation: a("gP4", 6.5, 0.6) }} />
        <circle cx={21} cy={56}  r={2.1} fill="#FAC775" opacity={0.5} style={{ animation: a("gP5", 7,   1.9) }} />
        <circle cx={46} cy={25}  r={2.3} fill="#EF9F27" opacity={0.6} style={{ animation: a("gP1", 5,   0.8) }} />

      </svg>
    </div>
  );
}
