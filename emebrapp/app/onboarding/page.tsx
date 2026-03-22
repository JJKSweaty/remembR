"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import GoldenOrb from "@/components/GoldenOrb";
import { supabase } from "@/lib/supabase";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type Step = 0 | 1 | 2 | 3 | 4 | 5;
type Role = "patient" | "caregiver" | null;

/* ─────────────────────────────────────────────
   Orb config per step
───────────────────────────────────────────── */
const ORB: Record<Step, { size: number; y: string; x: string; intensity: "low" | "medium" | "high" }> = {
  0: { size: 140, y: "0px",    x: "0px",    intensity: "high"   },
  1: { size: 120, y: "-80px",  x: "0px",    intensity: "medium" },
  2: { size: 80,  y: "-130px", x: "0px",    intensity: "low"    },
  3: { size: 100, y: "-120px", x: "0px",    intensity: "medium" },
  4: { size: 100, y: "-60px",  x: "0px",    intensity: "medium" },
  5: { size: 150, y: "-90px",  x: "0px",    intensity: "high"   },
};

/* ─────────────────────────────────────────────
   Letter stagger helper
───────────────────────────────────────────── */
function StaggerText({ text, startDelay = 0, className, style }: {
  text: string; startDelay?: number;
  className?: string; style?: React.CSSProperties;
}) {
  return (
    <span className={className} style={{ display: "inline-block", ...style }}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: startDelay + i * 0.05, duration: 0.4, ease: "easeOut" }}
          style={{ display: "inline-block", whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function Onboarding() {
  const router = useRouter();
  const [step, setStep]       = useState<Step>(0);
  const [role, setRole]       = useState<Role>(null);
  const [name, setName]       = useState("");
  const [hasMeds, setHasMeds] = useState<boolean | null>(null);
  const [exiting, setExiting] = useState(false);
  const [orbPulse, setOrbPulse] = useState(false);
  const [nameGlow, setNameGlow] = useState(false);
  const [finalExpand, setFinalExpand] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeyTime = useRef(0);

  // Skip if already onboarded
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("ember_onboarded") === "true") {
      router.replace("/");
    }
  }, [router]);

  // Step 0 — auto-advance at 3s
  useEffect(() => {
    if (step !== 0) return;
    const t = setTimeout(() => setStep(1), 3000);
    return () => clearTimeout(t);
  }, [step]);

  // Focus input on step 3
  useEffect(() => {
    if (step === 3) setTimeout(() => inputRef.current?.focus(), 600);
  }, [step]);

  const pulseOrb = () => {
    setOrbPulse(true);
    setTimeout(() => setOrbPulse(false), 600);
  };

  const advance = (next: Step) => {
    pulseOrb();
    setTimeout(() => setStep(next), 300);
  };

  const handleKeyType = () => {
    const now = Date.now();
    if (now - lastKeyTime.current > 100) {
      pulseOrb();
      lastKeyTime.current = now;
    }
  };

  const handleComplete = async () => {
    setNameGlow(true);
    pulseOrb();
    await new Promise((r) => setTimeout(r, 800));
    setNameGlow(false);
    advance(5);
  };

  const handleEnterEmber = async () => {
    // Save to localStorage
    localStorage.setItem("ember_onboarded", "true");
    localStorage.setItem("ember_user_name", name);
    localStorage.setItem("ember_user_role", role || "patient");

    // Save to Supabase
    try {
      const { data: existing } = await supabase.from("patient_profile").select("id").limit(1).single();
      const profile = { name, notes: `Role: ${role}${hasMeds ? " | Has medications" : ""}` };
      if (existing?.id) {
        await supabase.from("patient_profile").update(profile).eq("id", existing.id);
      } else {
        await supabase.from("patient_profile").insert(profile);
      }
    } catch {}

    // Expand orb to fill screen then navigate
    setFinalExpand(true);
    setTimeout(() => router.replace("/"), 1000);
  };

  const orb = ORB[step];

  return (
    <>
      <style>{`
        @keyframes shine {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(300%) skewX(-15deg); }
        }
        @keyframes name-glow {
          0%, 100% { text-shadow: 0 0 0 transparent; }
          50%       { text-shadow: 0 0 24px rgba(239,159,39,0.9); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        * { box-sizing: border-box; }
      `}</style>

      {/* Full-screen golden flood for final transition */}
      <AnimatePresence>
        {finalExpand && (
          <motion.div
            initial={{ scale: 0, opacity: 1, borderRadius: "50%" }}
            animate={{ scale: 40, opacity: 1, borderRadius: "0%" }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              width: 140, height: 140,
              marginTop: -70, marginLeft: -70,
              background: "radial-gradient(circle, #FAD070, #EF9F27)",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* Root container */}
      <div style={{
        position: "fixed", inset: 0,
        background: "#0F0E09",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* Ambient glow behind orb */}
        <motion.div
          animate={{
            opacity: step === 0 ? [0, 0.6, 0.4] : 0.35,
            scale:   orbPulse ? 1.3 : 1,
          }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{
            position: "absolute",
            width: 300, height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(239,159,39,0.35) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* ── ORB — single persistent element ── */}
        <motion.div
          animate={{
            y:     orb.y,
            scale: orbPulse ? (step === 5 ? 1.15 : 1.06) : 1,
          }}
          transition={{
            y:     { type: "spring", stiffness: 120, damping: 22 },
            scale: { duration: 0.3, ease: "easeInOut" },
          }}
          style={{ position: "relative", zIndex: 2, flexShrink: 0 }}
        >
          {step === 0 ? (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <GoldenOrb size={orb.size} intensity={orb.intensity} />
            </motion.div>
          ) : (
            <GoldenOrb size={orb.size} intensity={orb.intensity} />
          )}
        </motion.div>

        {/* ── STEP CONTENT ── */}
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 32px",
          zIndex: 3,
          pointerEvents: "none",
        }}>

          {/* ── STEP 0: Birth ── */}
          <AnimatePresence>
            {step === 0 && (
              <motion.div
                key="step0"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 180 }}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.8, duration: 0.6 }}
                  style={{
                    fontSize: 32,
                    letterSpacing: "0.35em",
                    color: "#FAD070",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 300,
                  }}
                >
                  <StaggerText text="ember" startDelay={1.8} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── STEP 1: Hello ── */}
          <AnimatePresence>
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", marginTop: 140, pointerEvents: "auto",
                }}
              >
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
                  style={{
                    fontSize: 52, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: 0, lineHeight: 1.1,
                  }}
                >
                  Hello.
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                  style={{
                    marginTop: 16, fontSize: 15, color: "rgba(250,240,220,0.55)",
                    fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, maxWidth: 260,
                  }}
                >
                  I&apos;m Ember — a gentle companion designed to help with everyday life.
                </motion.p>
                <motion.button
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3, duration: 0.4 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => advance(2)}
                  style={{
                    marginTop: 40,
                    background: "#EF9F27",
                    border: "none", borderRadius: 50,
                    padding: "14px 40px",
                    fontSize: 15, fontWeight: 500,
                    color: "#0F0E09",
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    boxShadow: "0 4px 24px rgba(239,159,39,0.4)",
                    pointerEvents: "auto",
                  }}
                >
                  Get started
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── STEP 2: Who ── */}
          <AnimatePresence>
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", marginTop: 90, width: "100%", pointerEvents: "auto",
                }}
              >
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{
                    fontSize: 13, color: "rgba(250,240,220,0.45)",
                    fontFamily: "'DM Sans', sans-serif",
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  Who is Ember for?
                </motion.p>
                <motion.h2
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.5 }}
                  style={{
                    fontSize: 32, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: "0 0 28px", lineHeight: 1.2,
                  }}
                >
                  I&apos;m setting this up for…
                </motion.h2>

                <div style={{ display: "flex", gap: 14, width: "100%" }}>
                  {[
                    { id: "patient" as Role,   emoji: "🌿", label: "Myself",    sub: "I'll be using Ember" },
                    { id: "caregiver" as Role, emoji: "🤝", label: "Someone I care for", sub: "I'm a caregiver" },
                  ].map((card, i) => (
                    <motion.button
                      key={card.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.5, ease: "easeOut" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setRole(card.id); pulseOrb(); }}
                      style={{
                        flex: 1,
                        position: "relative",
                        overflow: "hidden",
                        background: "rgba(30,28,15,0.85)",
                        backdropFilter: "blur(20px)",
                        border: `1px solid ${role === card.id ? "rgba(239,159,39,0.7)" : "rgba(239,159,39,0.15)"}`,
                        borderRadius: 24,
                        padding: "28px 16px 24px",
                        cursor: "pointer",
                        textAlign: "center",
                        boxShadow: role === card.id
                          ? "0 0 0 1px rgba(239,159,39,0.3), 0 8px 32px rgba(239,159,39,0.2)"
                          : "0 4px 20px rgba(0,0,0,0.4)",
                        transition: "border-color 0.3s, box-shadow 0.3s",
                      }}
                    >
                      {/* Shine sweep on selection */}
                      {role === card.id && (
                        <div style={{
                          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                          background: "linear-gradient(105deg, transparent 40%, rgba(239,159,39,0.18) 50%, transparent 60%)",
                          animation: "shine 1s ease forwards",
                          pointerEvents: "none",
                        }} />
                      )}
                      <div style={{ fontSize: 40, marginBottom: 12 }}>{card.emoji}</div>
                      <div style={{
                        fontSize: 20, fontStyle: "italic", fontWeight: 400,
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        color: role === card.id ? "#FAD070" : "#FAF0DC",
                        marginBottom: 6, lineHeight: 1.2,
                        transition: "color 0.3s",
                      }}>
                        {card.label}
                      </div>
                      <div style={{
                        fontSize: 12, color: "rgba(250,240,220,0.45)",
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {card.sub}
                      </div>
                    </motion.button>
                  ))}
                </div>

                <AnimatePresence>
                  {role && (
                    <motion.button
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => advance(3)}
                      style={{
                        marginTop: 28,
                        background: "#EF9F27", border: "none", borderRadius: 50,
                        padding: "14px 48px",
                        fontSize: 15, fontWeight: 500, color: "#0F0E09",
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: "pointer",
                        boxShadow: "0 4px 24px rgba(239,159,39,0.4)",
                      }}
                    >
                      Continue
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── STEP 3: Name ── */}
          <AnimatePresence>
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", marginTop: 120, width: "100%", pointerEvents: "auto",
                }}
              >
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{
                    fontSize: 13, color: "rgba(250,240,220,0.45)",
                    fontFamily: "'DM Sans', sans-serif",
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  {role === "caregiver" ? "Their name" : "Your name"}
                </motion.p>
                <motion.h2
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.5 }}
                  style={{
                    fontSize: 30, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: "0 0 36px",
                  }}
                >
                  {role === "caregiver" ? "What is their name?" : "What should I call you?"}
                </motion.h2>

                {/* Underline input */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
                  style={{ width: "100%", maxWidth: 300 }}
                >
                  <div style={{ position: "relative" }}>
                    <input
                      ref={inputRef}
                      value={name}
                      onChange={(e) => { setName(e.target.value); handleKeyType(); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) handleComplete(); }}
                      placeholder="Name…"
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        borderBottom: `1.5px solid ${name ? "rgba(239,159,39,0.8)" : "rgba(250,240,220,0.2)"}`,
                        outline: "none",
                        padding: "8px 4px 12px",
                        fontSize: 36,
                        fontStyle: "italic",
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        color: nameGlow ? "#FAD070" : "#FAF0DC",
                        textAlign: "center",
                        caretColor: "#EF9F27",
                        boxShadow: name ? "0 1px 0 0 rgba(239,159,39,0.5)" : "none",
                        transition: "border-color 0.3s, color 0.3s, box-shadow 0.3s",
                        animation: nameGlow ? "name-glow 0.8s ease" : "none",
                      }}
                    />
                  </div>
                </motion.div>

                <AnimatePresence>
                  {name.trim() && (
                    <motion.button
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleComplete}
                      style={{
                        marginTop: 36,
                        background: "#EF9F27", border: "none", borderRadius: 50,
                        padding: "14px 48px",
                        fontSize: 15, fontWeight: 500, color: "#0F0E09",
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: "pointer",
                        boxShadow: "0 4px 24px rgba(239,159,39,0.4)",
                      }}
                    >
                      Continue
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── STEP 4: Medications ── */}
          <AnimatePresence>
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", marginTop: 80, width: "100%", pointerEvents: "auto",
                }}
              >
                <motion.h2
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{
                    fontSize: 30, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: "0 0 8px", lineHeight: 1.3,
                  }}
                >
                  Does{" "}
                  <span style={{ color: "#FAD070" }}>{name}</span>
                  {" "}take any medications?
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  style={{ fontSize: 13, color: "rgba(250,240,220,0.4)", marginBottom: 36, fontFamily: "'DM Sans', sans-serif" }}
                >
                  You can always add them later
                </motion.p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
                  {[
                    { val: true,  label: "Yes, they do",    sub: "I'll help keep track" },
                    { val: false, label: "No, not right now", sub: "We can add them anytime" },
                  ].map((opt, i) => (
                    <motion.button
                      key={String(opt.val)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.12, duration: 0.4, ease: "easeOut" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setHasMeds(opt.val);
                        pulseOrb();
                        setTimeout(() => advance(5), 400);
                      }}
                      style={{
                        background: "rgba(30,28,15,0.85)",
                        backdropFilter: "blur(20px)",
                        border: "1px solid rgba(239,159,39,0.18)",
                        borderRadius: 20,
                        padding: "20px 24px",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex", flexDirection: "column", gap: 4,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                        transition: "border-color 0.2s",
                      }}
                    >
                      <span style={{
                        fontSize: 18, fontStyle: "italic",
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        color: "#FAF0DC", fontWeight: 400,
                      }}>
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 12, color: "rgba(250,240,220,0.4)", fontFamily: "'DM Sans', sans-serif" }}>
                        {opt.sub}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── STEP 5: Completion ── */}
          <AnimatePresence>
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", marginTop: 160, pointerEvents: "auto",
                }}
              >
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  style={{
                    fontSize: 32, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: 0, lineHeight: 1.2,
                  }}
                >
                  You&apos;re all set,
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7, duration: 0.6 }}
                  style={{
                    fontSize: 44, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAD070", margin: "4px 0 0",
                    textShadow: "0 0 32px rgba(239,159,39,0.5)",
                  }}
                >
                  {name}.
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.4, duration: 0.6 }}
                  style={{
                    marginTop: 20, fontSize: 15, color: "rgba(250,240,220,0.5)",
                    fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em",
                  }}
                >
                  Ember is ready.
                </motion.p>
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.0, duration: 0.5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleEnterEmber}
                  style={{
                    marginTop: 44,
                    background: "#EF9F27",
                    border: "none", borderRadius: 50,
                    padding: "16px 52px",
                    fontSize: 16, fontWeight: 600,
                    color: "#0F0E09",
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    boxShadow: "0 6px 32px rgba(239,159,39,0.5)",
                    letterSpacing: "0.02em",
                  }}
                >
                  Enter Ember
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* ── Progress dots (steps 1–4) ── */}
        <AnimatePresence>
          {step >= 1 && step <= 4 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "absolute",
                bottom: 44,
                display: "flex", gap: 8,
                zIndex: 10,
              }}
            >
              {[1, 2, 3, 4].map((s) => (
                <motion.div
                  key={s}
                  animate={{ scale: step === s ? 1.4 : 1, opacity: step === s ? 1 : 0.35 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: step === s ? "#EF9F27" : "#4A4232",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </>
  );
}
