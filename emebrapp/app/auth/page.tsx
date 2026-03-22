"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, User, Shield } from "lucide-react";
import GoldenOrb from "@/components/GoldenOrb";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";
type Role = "patient" | "caregiver";

function friendlyError(msg: string): string {
  if (/invalid login credentials/i.test(msg))   return "That email or password doesn't match.";
  if (/user already registered/i.test(msg))      return "An account with this email already exists.";
  if (/email not confirmed/i.test(msg))          return "Please confirm your email before signing in.";
  if (/password.*characters/i.test(msg))         return "Password must be at least 8 characters.";
  if (/unable to validate/i.test(msg))           return "Something went wrong. Please try again.";
  if (/network/i.test(msg))                      return "Network error. Check your connection.";
  return "Something went wrong. Please try again.";
}

function passwordStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { level: 0, label: "" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || /[0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "Weak" };
  if (score === 2) return { level: 2, label: "Medium" };
  return { level: 3, label: "Strong" };
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode]           = useState<Mode>("signin");
  const [role, setRole]           = useState<Role>("patient");
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [focused, setFocused]     = useState<string | null>(null);

  const strength = passwordStrength(password);

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Please fill in all fields."); return; }
    if (mode === "signup" && password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (mode === "signup" && !name.trim()) { setError("Please enter a name."); return; }
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error: signUpErr } = await supabase.auth.signUp({ email: email.trim(), password });
        if (signUpErr) throw signUpErr;
        if (data.user) {
          // Store role in metadata via profile creation on onboarding
          localStorage.setItem("ember_signup_role", role);
          localStorage.setItem("ember_signup_name", name.trim());
          router.push("/auth/onboarding");
        }
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInErr) throw signInErr;
        if (data.user) {
          const { data: profile } = await supabase
            .from("patient_profile")
            .select("id")
            .eq("user_id", data.user.id)
            .limit(1)
            .single();
          router.push(profile ? "/" : "/auth/onboarding");
        }
      }
    } catch (err: any) {
      setError(friendlyError(err?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  const inp = (field: string): React.CSSProperties => ({
    width: "100%",
    background: "rgba(30,28,15,0.6)",
    border: `1px solid ${focused === field ? "rgba(239,159,39,0.6)" : "rgba(239,159,39,0.2)"}`,
    borderRadius: 14,
    padding: "14px 18px",
    color: "#F5EDD6",
    fontSize: 15,
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    boxShadow: focused === field ? "0 0 0 3px rgba(239,159,39,0.08)" : "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    caretColor: "#EF9F27",
  });

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0F0E09",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "0 24px 48px",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        ::placeholder { color: #4A4232 !important; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.3); }
      `}</style>

      {/* Orb header */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 52, marginBottom: 8 }}>
        <motion.div
          animate={loading ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={loading ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : {}}
        >
          <GoldenOrb size={100} intensity={loading ? "high" : "medium"} />
        </motion.div>
        <p style={{
          marginTop: 10, fontSize: 26, fontStyle: "italic", fontWeight: 300,
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          color: "#FAD070", letterSpacing: "0.12em",
        }}>
          ember
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: "flex",
        background: "rgba(30,28,15,0.8)",
        border: "1px solid rgba(239,159,39,0.15)",
        borderRadius: 50,
        padding: 4,
        marginBottom: 28,
        position: "relative",
      }}>
        {(["signin", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(""); }}
            style={{
              position: "relative", zIndex: 1,
              padding: "9px 22px",
              background: "transparent", border: "none",
              borderRadius: 50, cursor: "pointer",
              fontSize: 14, fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              color: mode === m ? "#0F0E09" : "rgba(250,240,220,0.4)",
              transition: "color 0.2s",
            }}
          >
            {mode === m && (
              <motion.div
                layoutId="tab-indicator"
                style={{ position: "absolute", inset: 0, background: "#EF9F27", borderRadius: 50, zIndex: -1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            {m === "signin" ? "Sign In" : "Create Account"}
          </button>
        ))}
      </div>

      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}>

        <AnimatePresence mode="wait">
          {mode === "signup" && (
            <motion.div
              key="signup-fields"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}
            >
              {/* Role selector */}
              <div>
                <p style={{ fontSize: 11, color: "rgba(250,240,220,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
                  I am a
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  {([
                    { id: "patient" as Role,   Icon: User,   label: "Patient",   sub: "Using Ember myself" },
                    { id: "caregiver" as Role, Icon: Shield, label: "Caregiver", sub: "Setting up for someone" },
                  ]).map(({ id, Icon, label, sub }) => (
                    <motion.button
                      key={id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setRole(id)}
                      style={{
                        flex: 1, padding: "16px 12px",
                        background: "rgba(30,28,15,0.6)",
                        border: `1px solid ${role === id ? "rgba(239,159,39,0.7)" : "rgba(239,159,39,0.15)"}`,
                        borderRadius: 16, cursor: "pointer", textAlign: "center",
                        boxShadow: role === id ? "0 0 0 1px rgba(239,159,39,0.2)" : "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      }}
                    >
                      <Icon size={24} color={role === id ? "#EF9F27" : "#4A4232"} strokeWidth={1.5} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: role === id ? "#FAD070" : "rgba(250,240,220,0.5)", fontFamily: "'DM Sans', sans-serif", transition: "color 0.2s" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(250,240,220,0.3)", fontFamily: "'DM Sans', sans-serif" }}>
                        {sub}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setFocused("name")}
                onBlur={() => setFocused(null)}
                style={inp("name")}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Email */}
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setFocused("email")}
          onBlur={() => setFocused(null)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={inp("email")}
        />

        {/* Password */}
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            style={{ ...inp("password"), paddingRight: 50 }}
          />
          <button
            onClick={() => setShowPw((v) => !v)}
            style={{
              position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex",
            }}
          >
            {showPw
              ? <EyeOff size={16} color="rgba(250,240,220,0.3)" />
              : <Eye    size={16} color="rgba(250,240,220,0.3)" />
            }
          </button>
        </div>

        {/* Password strength (signup only) */}
        <AnimatePresence>
          {mode === "signup" && password.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <motion.div
                  animate={{ width: strength.level === 1 ? "33%" : strength.level === 2 ? "66%" : "100%" }}
                  transition={{ duration: 0.3 }}
                  style={{
                    height: "100%", borderRadius: 3,
                    background: strength.level === 1 ? "#E07060" : strength.level === 2 ? "#EF9F27" : "#4CAF82",
                  }}
                />
              </div>
              <p style={{ fontSize: 11, marginTop: 4, fontFamily: "'DM Sans', sans-serif",
                color: strength.level === 1 ? "#E07060" : strength.level === 2 ? "#EF9F27" : "#4CAF82" }}>
                {strength.label}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Forgot password */}
        {mode === "signin" && (
          <p style={{ textAlign: "right", fontSize: 13, color: "rgba(250,240,220,0.3)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Forgot password?
          </p>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                fontSize: 14, fontStyle: "italic",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                color: "#E07060", textAlign: "center", lineHeight: 1.4,
              }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Submit */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={loading}
          style={{
            marginTop: 4,
            width: "100%", padding: "15px",
            background: loading ? "rgba(239,159,39,0.6)" : "#EF9F27",
            border: "none", borderRadius: 50,
            fontSize: 16, fontWeight: 600, color: "#0F0E09",
            fontFamily: "'DM Sans', sans-serif",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 4px 24px rgba(239,159,39,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          {loading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              style={{ width: 18, height: 18, border: "2px solid rgba(15,14,9,0.3)", borderTopColor: "#0F0E09", borderRadius: "50%" }}
            />
          ) : (
            mode === "signin" ? "Sign In" : "Create Account"
          )}
        </motion.button>

      </div>
    </div>
  );
}
