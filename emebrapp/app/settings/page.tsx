"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import PageWrapper from "@/components/PageWrapper";
import { checkPiHealth } from "@/lib/pi";
import { getUserProfile, saveUserProfile, type UserProfile } from "@/lib/memory";
import { useTimeTheme, setDebugTheme, type TimeOfDay } from "@/lib/useTimeTheme";

type TestStatus = null | "testing" | "connected" | "failed";
const DEFAULT_PI_URL = process.env.NEXT_PUBLIC_PI_URL || "http://secondsight.tail1535d0.ts.net:8000";
const LEGACY_PI_URL  = "http://10.0.0.120:8000";
const normalizeUrl   = (v: string) => v.trim().replace(/\/+$/, "");

const CLIENT_KEY = "ember_client_info";

interface ClientInfo {
  preferred_name: string;
  date_of_birth: string;
  caregiver_name: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  health_conditions: string;
  allergies: string;
  hobbies: string;
  notes: string;
  notif_meds: boolean;
  notif_reminders: boolean;
}

const defaultClient: ClientInfo = {
  preferred_name: "", date_of_birth: "", caregiver_name: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  health_conditions: "", allergies: "", hobbies: "", notes: "",
  notif_meds: true, notif_reminders: true,
};

function loadClient(): ClientInfo {
  if (typeof window === "undefined") return defaultClient;
  try {
    const raw = localStorage.getItem(CLIENT_KEY);
    return raw ? { ...defaultClient, ...JSON.parse(raw) } : defaultClient;
  } catch { return defaultClient; }
}

function buildNotes(c: ClientInfo): string {
  const parts: string[] = [];
  if (c.preferred_name)        parts.push(`Preferred name: ${c.preferred_name}`);
  if (c.caregiver_name)        parts.push(`Primary caregiver: ${c.caregiver_name}`);
  if (c.health_conditions)     parts.push(`Health conditions: ${c.health_conditions}`);
  if (c.allergies)             parts.push(`Allergies: ${c.allergies}`);
  if (c.hobbies)               parts.push(`Hobbies & interests: ${c.hobbies}`);
  if (c.notes)                 parts.push(`Additional notes: ${c.notes}`);
  return parts.join(". ");
}

export default function Settings() {
  const router = useRouter();
  const { timeOfDay } = useTimeTheme();

  const [piUrl, setPiUrl] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PI_URL;
    const saved = localStorage.getItem("piUrl") || "";
    if (!normalizeUrl(saved) || normalizeUrl(saved) === normalizeUrl(LEGACY_PI_URL)) return DEFAULT_PI_URL;
    return saved;
  });
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [profile, setProfile] = useState<UserProfile>({ name: "", address: "", medications: [], schedule: [] });
  const [client, setClient]   = useState<ClientInfo>(defaultClient);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [saved, setSaved]             = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("piUrl") || "";
    if (!normalizeUrl(saved) || normalizeUrl(saved) === normalizeUrl(LEGACY_PI_URL)) {
      localStorage.setItem("piUrl", DEFAULT_PI_URL);
    }
    setClient(loadClient());
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          const p = data.profile;
          setProfile((prev) => ({ ...prev, name: p.name || "", address: p.address || "" }));
          setClient((prev) => ({
            ...prev,
            emergency_contact_name: p.emergency_contact_name || prev.emergency_contact_name,
            emergency_contact_phone: p.emergency_contact_phone || prev.emergency_contact_phone,
            date_of_birth: p.date_of_birth || prev.date_of_birth,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    // Save locally
    localStorage.setItem(CLIENT_KEY, JSON.stringify(client));
    saveUserProfile({ ...profile });

    // Save to Supabase
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name,
        address: profile.address,
        emergency_contact_name: client.emergency_contact_name,
        emergency_contact_phone: client.emergency_contact_phone,
        date_of_birth: client.date_of_birth || null,
        notes: buildNotes(client),
      }),
    }).catch(() => {});

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleUrlChange = (val: string) => {
    setPiUrl(val);
    if (typeof window !== "undefined") localStorage.setItem("piUrl", val);
    setTestStatus(null);
  };

  const testConnection = async () => {
    setTestStatus("testing");
    const ok = await checkPiHealth();
    setTestStatus(ok ? "connected" : "failed");
    if (ok) setTimeout(() => setTestStatus(null), 4000);
  };

  const inp = (field: string): React.CSSProperties => ({
    width: "100%", background: "var(--background)",
    border: `1px solid ${focusedField === field ? "#EF9F27" : "rgba(239,159,39,0.2)"}`,
    borderRadius: 12, padding: "13px 16px",
    color: "var(--text-primary)", fontSize: 15,
    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    outline: "none",
    boxShadow: focusedField === field ? "0 0 0 3px rgba(239,159,39,0.08)" : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    colorScheme: "dark" as const,
  });

  const label = (text: string) => (
    <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
      {text}
    </p>
  );

  const card = (delay: number) => ({
    background: "var(--card)",
    border: "1px solid rgba(239,159,39,0.15)",
    borderRadius: 24,
    boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
    padding: "20px",
    marginBottom: 16,
  });

  const sectionTitle = (text: string) => (
    <p style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
      {text}
    </p>
  );

  return (
    <PageWrapper>
      <div style={{ padding: "0 24px 120px" }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(239,159,39,0.1)", marginBottom: 28 }}>
          <button onClick={() => router.push("/")} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(239,159,39,0.08)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft size={18} color="#EF9F27" strokeWidth={2} />
          </button>
          <p style={{ fontSize: 22, fontStyle: "italic", fontWeight: 400, color: "var(--text-primary)", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", lineHeight: 1 }}>
            Settings
          </p>
          <div style={{ width: 36 }} />
        </div>

        {/* ── Patient Identity ──────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }} style={card(0.05)}>
          {sectionTitle("Patient Identity")}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              {label("Full name")}
              <input type="text" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} onFocus={() => setFocusedField("name")} onBlur={() => setFocusedField(null)} placeholder="e.g. Margaret Thompson" style={inp("name")} />
            </div>
            <div>
              {label("Preferred name / nickname")}
              <input type="text" value={client.preferred_name} onChange={(e) => setClient((c) => ({ ...c, preferred_name: e.target.value }))} onFocus={() => setFocusedField("preferred_name")} onBlur={() => setFocusedField(null)} placeholder="e.g. Maggie" style={inp("preferred_name")} />
            </div>
            <div>
              {label("Date of birth")}
              <input type="date" value={client.date_of_birth} onChange={(e) => setClient((c) => ({ ...c, date_of_birth: e.target.value }))} onFocus={() => setFocusedField("dob")} onBlur={() => setFocusedField(null)} style={inp("dob")} />
            </div>
            <div>
              {label("Home address")}
              <input type="text" value={profile.address} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} onFocus={() => setFocusedField("address")} onBlur={() => setFocusedField(null)} placeholder="e.g. 14 Maple Street, Toronto" style={inp("address")} />
            </div>
          </div>
        </motion.div>

        {/* ── Health & Care ─────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} style={card(0.1)}>
          {sectionTitle("Health & Care")}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              {label("Health conditions / diagnoses")}
              <textarea value={client.health_conditions} onChange={(e) => setClient((c) => ({ ...c, health_conditions: e.target.value }))} onFocus={() => setFocusedField("health")} onBlur={() => setFocusedField(null)} placeholder="e.g. Type 2 diabetes, early-stage Alzheimer's" rows={2} style={{ ...inp("health"), resize: "none" }} />
            </div>
            <div>
              {label("Allergies")}
              <input type="text" value={client.allergies} onChange={(e) => setClient((c) => ({ ...c, allergies: e.target.value }))} onFocus={() => setFocusedField("allergies")} onBlur={() => setFocusedField(null)} placeholder="e.g. Penicillin, peanuts" style={inp("allergies")} />
            </div>
            <div>
              {label("Primary caregiver name")}
              <input type="text" value={client.caregiver_name} onChange={(e) => setClient((c) => ({ ...c, caregiver_name: e.target.value }))} onFocus={() => setFocusedField("caregiver")} onBlur={() => setFocusedField(null)} placeholder="e.g. Sarah Johnson" style={inp("caregiver")} />
            </div>
          </div>
        </motion.div>

        {/* ── Personality & Interests ───────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} style={card(0.15)}>
          {sectionTitle("Personality & Interests")}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              {label("Hobbies & interests")}
              <textarea value={client.hobbies} onChange={(e) => setClient((c) => ({ ...c, hobbies: e.target.value }))} onFocus={() => setFocusedField("hobbies")} onBlur={() => setFocusedField(null)} placeholder="e.g. Gardening, birdwatching, classic films, crossword puzzles" rows={2} style={{ ...inp("hobbies"), resize: "none" }} />
            </div>
            <div>
              {label("Additional notes for Ember")}
              <textarea value={client.notes} onChange={(e) => setClient((c) => ({ ...c, notes: e.target.value }))} onFocus={() => setFocusedField("notes")} onBlur={() => setFocusedField(null)} placeholder="Anything else Ember should know — family members, favourite topics, things that comfort them…" rows={3} style={{ ...inp("notes"), resize: "none" }} />
            </div>
          </div>
        </motion.div>

        {/* ── Emergency Contact ─────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} style={card(0.2)}>
          {sectionTitle("Emergency Contact")}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              {label("Contact name")}
              <input type="text" value={client.emergency_contact_name} onChange={(e) => setClient((c) => ({ ...c, emergency_contact_name: e.target.value }))} onFocus={() => setFocusedField("ec_name")} onBlur={() => setFocusedField(null)} placeholder="e.g. David Thompson" style={inp("ec_name")} />
            </div>
            <div>
              {label("Contact phone")}
              <input type="tel" value={client.emergency_contact_phone} onChange={(e) => setClient((c) => ({ ...c, emergency_contact_phone: e.target.value }))} onFocus={() => setFocusedField("ec_phone")} onBlur={() => setFocusedField(null)} placeholder="e.g. +1 416 555 0123" style={inp("ec_phone")} />
            </div>
          </div>
        </motion.div>

        {/* ── Notifications ─────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }} style={card(0.25)}>
          {sectionTitle("Notifications")}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {([
              { key: "notif_meds",      label: "Medication reminders",    sub: "Alert when a medication is due or overdue" },
              { key: "notif_reminders", label: "Daily check-in prompts",  sub: "Morning greeting and evening wind-down" },
            ] as { key: keyof ClientInfo; label: string; sub: string }[]).map(({ key, label: lbl, sub }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 14, color: "var(--text-primary)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginBottom: 2 }}>{lbl}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>{sub}</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setClient((c) => ({ ...c, [key]: !c[key] }))}
                  style={{
                    width: 48, height: 28, borderRadius: 14, border: "none", cursor: "pointer", flexShrink: 0,
                    background: client[key] ? "#EF9F27" : "rgba(239,159,39,0.15)",
                    position: "relative", transition: "background 0.2s",
                  }}
                >
                  <motion.div
                    animate={{ x: client[key] ? 22 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{ position: "absolute", top: 3, width: 22, height: 22, borderRadius: "50%", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}
                  />
                </motion.button>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Theme ────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.28 }} style={card(0.28)}>
          {sectionTitle("Theme")}
          <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginBottom: 14, lineHeight: 1.5 }}>
            Ember adapts its look automatically based on time of day. Override it here.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { id: "morning" as TimeOfDay,   icon: "🌅", label: "Morning"   },
              { id: "afternoon" as TimeOfDay, icon: "☀️", label: "Afternoon" },
              { id: "evening" as TimeOfDay,   icon: "🌆", label: "Evening"   },
              { id: "night" as TimeOfDay,     icon: "🌙", label: "Night"     },
            ]).map(({ id, icon, label: lbl }) => {
              const active = timeOfDay === id;
              return (
                <motion.button
                  key={id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setDebugTheme(active ? null : id)}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    padding: "10px 6px",
                    background: active ? "#EF9F27" : "var(--background)",
                    border: `1px solid ${active ? "#EF9F27" : "rgba(239,159,39,0.2)"}`,
                    borderRadius: 14, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontSize: 10, color: active ? "#0F0E09" : "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: active ? 600 : 400 }}>
                    {lbl}
                  </span>
                </motion.button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", marginTop: 10, textAlign: "center" }}>
            Tap the active theme again to return to auto
          </p>
        </motion.div>

        {/* ── Camera Connection ─────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} style={card(0.3)}>
          {sectionTitle("Camera Connection")}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="text" value={piUrl} onChange={(e) => handleUrlChange(e.target.value)} onFocus={() => setFocusedField("piUrl")} onBlur={() => setFocusedField(null)} placeholder={DEFAULT_PI_URL} style={inp("piUrl")} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", lineHeight: 1.5 }}>
              Use your Pi&apos;s Tailscale hostname or IP — e.g. http://100.x.y.z:8000
            </p>
            {testStatus && testStatus !== "testing" && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: testStatus === "connected" ? "rgba(76,175,130,0.08)" : "rgba(226,75,74,0.08)", border: `1px solid ${testStatus === "connected" ? "rgba(76,175,130,0.2)" : "rgba(226,75,74,0.2)"}`, borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: testStatus === "connected" ? "#4CAF82" : "#E24B4A", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: testStatus === "connected" ? "#4CAF82" : "#E24B4A", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 500 }}>
                  {testStatus === "connected" ? "Connected" : "Disconnected"}
                </span>
              </motion.div>
            )}
            <motion.button whileTap={{ scale: 0.97 }} onClick={testConnection} disabled={testStatus === "testing"} style={{ width: "100%", padding: "14px", background: "transparent", color: testStatus === "testing" ? "var(--text-muted)" : "#EF9F27", border: `1px solid ${testStatus === "testing" ? "rgba(239,159,39,0.15)" : "rgba(239,159,39,0.4)"}`, borderRadius: 50, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", cursor: testStatus === "testing" ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
              {testStatus === "testing" ? "Testing…" : "Test Connection"}
            </motion.button>
          </div>
        </motion.div>

        {/* ── Save all ─────────────────────────────────────────────────── */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          style={{
            width: "100%", padding: "16px",
            background: saved ? "#4CAF82" : "#EF9F27",
            color: "#0F0E09", border: "none", borderRadius: 50,
            fontSize: 16, fontWeight: 600,
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            cursor: "pointer", transition: "background 0.2s",
            boxShadow: saved ? "0 4px 20px rgba(76,175,130,0.3)" : "0 4px 20px rgba(239,159,39,0.3)",
          }}
        >
          {saved ? "Saved ✓" : "Save All"}
        </motion.button>

        {/* ── Sign Out ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showSignOutConfirm ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              style={{
                marginTop: 12,
                background: "var(--card)",
                border: "1px solid rgba(224,112,96,0.3)",
                borderRadius: 20,
                padding: "18px 20px",
                display: "flex", flexDirection: "column", gap: 12,
              }}
            >
              <p style={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", textAlign: "center", margin: 0 }}>
                Are you sure you want to sign out?
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <motion.button whileTap={{ scale: 0.96 }}
                  onClick={() => setShowSignOutConfirm(false)}
                  style={{ flex: 1, padding: "11px", background: "transparent",
                    border: "1px solid rgba(239,159,39,0.25)", borderRadius: 50,
                    fontSize: 14, color: "var(--text-muted)",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", cursor: "pointer" }}>
                  Cancel
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }}
                  onClick={async () => { await supabase.auth.signOut(); router.push("/auth"); }}
                  style={{ flex: 1, padding: "11px", background: "rgba(224,112,96,0.12)",
                    border: "1px solid rgba(224,112,96,0.4)", borderRadius: 50,
                    fontSize: 14, fontWeight: 600, color: "#E07060",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", cursor: "pointer" }}>
                  Sign Out
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="signout-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowSignOutConfirm(true)}
              style={{
                marginTop: 12,
                width: "100%", padding: "14px",
                background: "transparent",
                border: "1px solid rgba(224,112,96,0.3)",
                borderRadius: 50,
                fontSize: 14, fontWeight: 500, color: "#E07060",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "border-color 0.2s",
              }}
            >
              <LogOut size={16} color="#E07060" strokeWidth={2} />
              Sign Out
            </motion.button>
          )}
        </AnimatePresence>

      </div>
    </PageWrapper>
  );
}
