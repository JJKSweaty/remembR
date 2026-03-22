"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { User, Heart } from "lucide-react";
import GoldenOrb from "@/components/GoldenOrb";
import { supabase } from "@/lib/supabase";

type Step = 0 | 1 | 2 | 3 | 4 | 5;
type ForWhom = "self" | "loved_one" | null;

function StaggerText({ text, startDelay = 0, style }: { text: string; startDelay?: number; style?: React.CSSProperties }) {
  return (
    <span style={{ display: "inline-block", ...style }}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: startDelay + i * 0.05, duration: 0.35, ease: "easeOut" }}
          style={{ display: "inline-block", whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

const ORB_SIZE: Record<Step, number> = {
  0: 140, 1: 110, 2: 80, 3: 100, 4: 100, 5: 150,
};
const ORB_Y: Record<Step, string> = {
  0: "0px", 1: "-90px", 2: "-140px", 3: "-130px", 4: "-70px", 5: "-100px",
};

export default function AuthOnboarding() {
  const router = useRouter();

  const [step, setStep]         = useState<Step>(0);
  const [forWhom, setForWhom]   = useState<ForWhom>(null);
  const [name, setName]         = useState("");
  const [hasMeds, setHasMeds]   = useState<boolean | null>(null);
  const [orbPulse, setOrbPulse] = useState(false);
  const [nameGlow, setNameGlow] = useState(false);
  const [finalExpand, setFinalExpand] = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);
  const lastKey    = useRef(0);

  // Read role from localStorage (set during signup)
  const signupRole = typeof window !== "undefined"
    ? (localStorage.getItem("ember_signup_role") as "patient" | "caregiver" | null)
    : null;
  const signupName = typeof window !== "undefined"
    ? localStorage.getItem("ember_signup_name") || ""
    : "";

  // Pre-fill name from signup
  useEffect(() => { if (signupName) setName(signupName); }, []);

  // Step 0 auto-advance
  useEffect(() => {
    if (step !== 0) return;
    const t = setTimeout(() => setStep(1), 2500);
    return () => clearTimeout(t);
  }, [step]);

  // Focus input on step 3
  useEffect(() => {
    if (step === 3) setTimeout(() => inputRef.current?.focus(), 500);
  }, [step]);

  const pulseOrb = () => { setOrbPulse(true); setTimeout(() => setOrbPulse(false), 500); };

  const advance = (next: Step) => { pulseOrb(); setTimeout(() => setStep(next), 280); };

  const handleKeyType = () => {
    const now = Date.now();
    if (now - lastKey.current > 120) { pulseOrb(); lastKey.current = now; }
  };

  const handleNameContinue = async () => {
    setNameGlow(true);
    pulseOrb();
    await new Promise((r) => setTimeout(r, 700));
    setNameGlow(false);
    advance(4);
  };

  const handleEnterEmber = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/auth"); return; }

    const role = signupRole || (forWhom === "loved_one" ? "caregiver" : "patient");
    const noteParts: string[] = [`Role: ${role}`];
    if (hasMeds) noteParts.push("Has medications");

    try {
      const { data: existing } = await supabase
        .from("patient_profile")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      const payload = {
        user_id: user.id,
        name: name.trim(),
        role,
        notes: noteParts.join(". "),
      };

      if (existing) {
        await supabase.from("patient_profile").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("patient_profile").insert(payload);
      }
    } catch {}

    localStorage.removeItem("ember_signup_role");
    localStorage.removeItem("ember_signup_name");
    localStorage.setItem("ember_onboarded", "true");

    setFinalExpand(true);
    setTimeout(() => router.replace("/"), 950);
  };

  const isCaregiver = signupRole === "caregiver";

  return (
    <>
      <style>{`
        @keyframes shine {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(300%) skewX(-15deg); }
        }
        @keyframes name-glow {
          0%, 100% { color: #FAF0DC; }
          50%       { color: #FAD070; text-shadow: 0 0 20px rgba(239,159,39,0.8); }
        }
        * { box-sizing: border-box; }
      `}</style>

      {/* Final orb flood */}
      <AnimatePresence>
        {finalExpand && (
          <motion.div
            initial={{ scale: 0, borderRadius: "50%" }}
            animate={{ scale: 40, borderRadius: "0%" }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              width: 150, height: 150,
              marginTop: -75, marginLeft: -75,
              background: "radial-gradient(circle, #FAD070, #EF9F27)",
              zIndex: 9999, pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      <div style={{
        position: "fixed", inset: 0, background: "#0F0E09",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden", fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* Ambient glow */}
        <motion.div
          animate={{ opacity: step === 0 ? [0, 0.5, 0.35] : 0.3, scale: orbPulse ? 1.35 : 1 }}
          transition={{ duration: 1.2 }}
          style={{
            position: "absolute", width: 320, height: 320, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(239,159,39,0.3) 0%, transparent 70%)",
            pointerEvents: "none", zIndex: 0,
          }}
        />

        {/* ORB */}
        <motion.div
          animate={{ y: ORB_Y[step], scale: orbPulse ? 1.07 : 1 }}
          transition={{ y: { type: "spring", stiffness: 110, damping: 20 }, scale: { duration: 0.25 } }}
          style={{ position: "relative", zIndex: 2, flexShrink: 0 }}
        >
          {step === 0 ? (
            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}>
              <GoldenOrb size={ORB_SIZE[step]} intensity="high" />
            </motion.div>
          ) : (
            <GoldenOrb size={ORB_SIZE[step]} intensity={step === 5 ? "high" : step <= 2 ? "low" : "medium"} />
          )}
        </motion.div>

        {/* CONTENT */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "0 28px", zIndex: 3, pointerEvents: "none",
        }}>

          {/* ── Step 0: Birth ── */}
          <AnimatePresence>
            {step === 0 && (
              <motion.div key="s0" exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
                style={{ marginTop: 190, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.6 }}
                  style={{ fontSize: 30, letterSpacing: "0.35em", color: "#FAD070",
                    fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 300 }}>
                  <StaggerText text="ember" startDelay={1.6} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 1: Hello ── */}
          <AnimatePresence>
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
                style={{ marginTop: 150, display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", pointerEvents: "auto" }}>
                <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  style={{ fontSize: 54, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: 0, lineHeight: 1.1 }}>
                  Hello.
                </motion.h1>
                <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                  style={{ marginTop: 14, fontSize: 15, color: "rgba(250,240,220,0.5)",
                    fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, maxWidth: 260 }}>
                  I&apos;m Ember — here to help every single day.
                </motion.p>
                <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3, duration: 0.4 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => advance(isCaregiver ? 2 : 3)}
                  style={{ marginTop: 40, background: "#EF9F27", border: "none", borderRadius: 50,
                    padding: "14px 44px", fontSize: 15, fontWeight: 500, color: "#0F0E09",
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    boxShadow: "0 4px 24px rgba(239,159,39,0.4)", pointerEvents: "auto" }}>
                  Get Started
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 2: Who (caregiver only) ── */}
          <AnimatePresence>
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
                style={{ marginTop: 100, display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", width: "100%", pointerEvents: "auto" }}>
                <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{ fontSize: 30, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: "0 0 24px", lineHeight: 1.3 }}>
                  Who are you setting this up for?
                </motion.h2>
                <div style={{ display: "flex", gap: 12, width: "100%" }}>
                  {([
                    { id: "self" as ForWhom,      Icon: User,  label: "Myself",      sub: "I'll be using Ember" },
                    { id: "loved_one" as ForWhom, Icon: Heart, label: "A loved one",  sub: "Setting up for someone else" },
                  ]).map(({ id, Icon, label, sub }, i) => (
                    <motion.button key={id}
                      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setForWhom(id); pulseOrb(); }}
                      style={{ flex: 1, position: "relative", overflow: "hidden",
                        background: "rgba(30,28,15,0.85)", backdropFilter: "blur(20px)",
                        border: `1px solid ${forWhom === id ? "rgba(239,159,39,0.7)" : "rgba(239,159,39,0.15)"}`,
                        borderRadius: 22, padding: "24px 14px 20px", cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                        boxShadow: forWhom === id ? "0 0 0 1px rgba(239,159,39,0.3), 0 6px 28px rgba(239,159,39,0.18)" : "0 4px 20px rgba(0,0,0,0.4)",
                        transition: "border-color 0.3s, box-shadow 0.3s" }}>
                      {forWhom === id && (
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                          background: "linear-gradient(105deg, transparent 40%, rgba(239,159,39,0.15) 50%, transparent 60%)",
                          animation: "shine 1s ease forwards", pointerEvents: "none" }} />
                      )}
                      <Icon size={28} color={forWhom === id ? "#EF9F27" : "#4A4232"} strokeWidth={1.5} />
                      <span style={{ fontSize: 18, fontStyle: "italic",
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        color: forWhom === id ? "#FAD070" : "#FAF0DC", transition: "color 0.3s" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(250,240,220,0.35)", fontFamily: "'DM Sans', sans-serif" }}>
                        {sub}
                      </span>
                    </motion.button>
                  ))}
                </div>
                <AnimatePresence>
                  {forWhom && (
                    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => advance(3)}
                      style={{ marginTop: 24, background: "#EF9F27", border: "none", borderRadius: 50,
                        padding: "14px 44px", fontSize: 15, fontWeight: 500, color: "#0F0E09",
                        fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                        boxShadow: "0 4px 24px rgba(239,159,39,0.4)", pointerEvents: "auto" }}>
                      Continue
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 3: Name ── */}
          <AnimatePresence>
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
                style={{ marginTop: 130, display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", width: "100%", pointerEvents: "auto" }}>
                <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  style={{ fontSize: 12, color: "rgba(250,240,220,0.4)", letterSpacing: "0.12em",
                    textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
                  {forWhom === "loved_one" || signupRole === "caregiver" ? "Their name" : "Your name"}
                </motion.p>
                <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.4 }}
                  style={{ fontSize: 30, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: "0 0 32px" }}>
                  {forWhom === "loved_one" || signupRole === "caregiver"
                    ? "What is their name?" : "What should I call you?"}
                </motion.h2>
                <motion.div initial={{ width: 0 }} animate={{ width: "100%" }}
                  transition={{ delay: 0.5, duration: 0.55, ease: "easeOut" }}
                  style={{ maxWidth: 280 }}>
                  <input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => { setName(e.target.value); handleKeyType(); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) handleNameContinue(); }}
                    placeholder="Name…"
                    style={{
                      width: "100%", background: "transparent", border: "none",
                      borderBottom: `1.5px solid ${name ? "rgba(239,159,39,0.8)" : "rgba(250,240,220,0.2)"}`,
                      outline: "none", padding: "8px 4px 12px",
                      fontSize: 36, fontStyle: "italic",
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      color: "#FAF0DC", textAlign: "center", caretColor: "#EF9F27",
                      boxShadow: name ? "0 1px 0 0 rgba(239,159,39,0.4)" : "none",
                      animation: nameGlow ? "name-glow 0.7s ease" : "none",
                      transition: "border-color 0.3s, box-shadow 0.3s",
                    }}
                  />
                </motion.div>
                <AnimatePresence>
                  {name.trim() && (
                    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNameContinue}
                      style={{ marginTop: 32, background: "#EF9F27", border: "none", borderRadius: 50,
                        padding: "14px 44px", fontSize: 15, fontWeight: 500, color: "#0F0E09",
                        fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                        boxShadow: "0 4px 24px rgba(239,159,39,0.4)", pointerEvents: "auto" }}>
                      Continue
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 4: Medications ── */}
          <AnimatePresence>
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
                style={{ marginTop: 90, display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", width: "100%", pointerEvents: "auto" }}>
                <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{ fontSize: 28, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: "0 0 8px", lineHeight: 1.3 }}>
                  Does{" "}
                  <span style={{ color: "#FAD070" }}>{name}</span>
                  {" "}take any medications?
                </motion.h2>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  style={{ fontSize: 13, color: "rgba(250,240,220,0.38)", marginBottom: 32,
                    fontFamily: "'DM Sans', sans-serif" }}>
                  You can always add them later
                </motion.p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                  {([
                    { val: true,  label: "Yes, they do",     sub: "I'll help keep track" },
                    { val: false, label: "Not right now",    sub: "We can add them anytime" },
                  ]).map((opt, i) => (
                    <motion.button key={String(opt.val)}
                      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.12, duration: 0.4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setHasMeds(opt.val); pulseOrb(); setTimeout(() => advance(5), 380); }}
                      style={{ background: "rgba(30,28,15,0.85)", backdropFilter: "blur(20px)",
                        border: "1px solid rgba(239,159,39,0.18)", borderRadius: 18,
                        padding: "18px 22px", cursor: "pointer", textAlign: "left",
                        display: "flex", flexDirection: "column", gap: 3,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.3)", transition: "border-color 0.2s" }}>
                      <span style={{ fontSize: 18, fontStyle: "italic",
                        fontFamily: "'Cormorant Garamond', Georgia, serif", color: "#FAF0DC" }}>
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(250,240,220,0.35)", fontFamily: "'DM Sans', sans-serif" }}>
                        {opt.sub}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 5: Completion ── */}
          <AnimatePresence>
            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                style={{ marginTop: 170, display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", pointerEvents: "auto" }}>
                <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  style={{ fontSize: 32, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAF0DC", margin: 0, lineHeight: 1.2 }}>
                  You&apos;re all set,
                </motion.p>
                <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75, duration: 0.6 }}
                  style={{ fontSize: 46, fontWeight: 300, fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: "#FAD070", margin: "4px 0 0",
                    textShadow: "0 0 30px rgba(239,159,39,0.45)" }}>
                  {name}.
                </motion.p>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 0.6 }}
                  style={{ marginTop: 18, fontSize: 15, color: "rgba(250,240,220,0.45)",
                    fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em" }}>
                  Ember is ready.
                </motion.p>
                <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.1, duration: 0.5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleEnterEmber}
                  style={{ marginTop: 44, background: "#EF9F27", border: "none", borderRadius: 50,
                    padding: "16px 52px", fontSize: 16, fontWeight: 600, color: "#0F0E09",
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    boxShadow: "0 6px 32px rgba(239,159,39,0.5)", letterSpacing: "0.02em" }}>
                  Enter Ember
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* Progress dots */}
        <AnimatePresence>
          {step >= 1 && step <= 4 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "absolute", bottom: 40, display: "flex", gap: 8, zIndex: 10 }}>
              {[1, 2, 3, 4].filter((s) => !(s === 2 && !isCaregiver)).map((s, idx) => {
                const active = step === s || (s === 2 && !isCaregiver && step === 3);
                return (
                  <motion.div key={s}
                    animate={{ scale: active ? 1.4 : 1, opacity: active ? 1 : 0.3 }}
                    transition={{ duration: 0.25 }}
                    style={{ width: 6, height: 6, borderRadius: "50%",
                      background: active ? "#EF9F27" : "#4A4232" }} />
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </>
  );
}
