"use client";

import { useState, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import { checkPiHealth } from "@/lib/pi";
import { getUserProfile, saveUserProfile, type UserProfile } from "@/lib/memory";
import { showToast } from "@/lib/voice";

type OrbMood = "idle" | "scanning" | "happy";
type TestStatus = null | "testing" | "connected" | "failed";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  outline: "none",
  fontSize: 15,
  fontWeight: 300,
  color: "#2a1a08",
  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
};

const fieldBox: React.CSSProperties = {
  background: "rgba(255,252,248,0.95)",
  border: "1px solid rgba(200,160,100,0.2)",
  borderRadius: 16,
  padding: "14px 18px",
  boxShadow: "0 2px 12px rgba(120,80,40,0.06)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "rgba(60,40,20,0.35)", letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: 10,
};

export default function Settings() {
  const [piUrl, setPiUrl] = useState("http://remembr-pi.tail1234.ts.net:8000");
  const [demoMode, setDemoMode] = useState(false);
  const [orbMood, setOrbMood] = useState<OrbMood>("idle");
  const [testStatus, setTestStatus] = useState<TestStatus>(null);

  // Profile state
  const [profile, setProfile] = useState<UserProfile>({
    name: "", address: "", medications: [], schedule: [],
  });
  const [newMedName, setNewMedName] = useState("");
  const [newMedDose, setNewMedDose] = useState("");
  const [newMedTime, setNewMedTime] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("piUrl");
    if (saved) setPiUrl(saved);
    setDemoMode(localStorage.getItem("piDemoMode") === "true");

    // Load from localStorage first (instant)
    setProfile(getUserProfile());

    // Then try to load from Supabase (source of truth)
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          const p = data.profile;
          const merged = {
            ...getUserProfile(),
            name: p.name || getUserProfile().name,
            address: p.address || getUserProfile().address,
          };
          setProfile(merged);
          saveUserProfile(merged);
        }
      })
      .catch(() => { /* Supabase not configured, use localStorage */ });
  }, []);

  const updateProfile = (partial: Partial<UserProfile>) => {
    const updated = { ...profile, ...partial };
    setProfile(updated);
    saveUserProfile(updated); // localStorage (always)

    // Also save to Supabase
    fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.name,
        address: updated.address,
      }),
    }).catch(() => { /* Supabase not configured */ });
  };

  const addMed = () => {
    if (!newMedName.trim() || !newMedDose.trim() || !newMedTime.trim()) return;
    const updated = [...profile.medications, { name: newMedName.trim(), dose: newMedDose.trim(), time: newMedTime.trim() }];
    updateProfile({ medications: updated });
    setNewMedName(""); setNewMedDose(""); setNewMedTime("");
    showToast(`Added ${newMedName.trim()}`);
  };

  const removeMed = (idx: number) => {
    const updated = profile.medications.filter((_, i) => i !== idx);
    updateProfile({ medications: updated });
  };

  const handleUrlChange = (val: string) => {
    setPiUrl(val);
    if (typeof window !== "undefined") localStorage.setItem("piUrl", val);
    setTestStatus(null);
  };

  const handleDemoToggle = () => {
    const next = !demoMode;
    setDemoMode(next);
    if (typeof window !== "undefined") localStorage.setItem("piDemoMode", String(next));
  };

  const testConnection = async () => {
    setTestStatus("testing");
    setOrbMood("scanning");
    const ok = await checkPiHealth();
    if (ok) {
      setTestStatus("connected");
      setOrbMood("happy");
      setTimeout(() => setOrbMood("idle"), 3000);
    } else {
      setTestStatus("failed");
      setOrbMood("idle");
    }
  };

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, color: "rgba(60,40,20,0.35)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>Configuration</p>
          <h2 style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, color: "#2a1a08", letterSpacing: "-0.3px", lineHeight: 1.1 }}>
            App<br /><em style={{ color: "#c87840" }}>settings</em>
          </h2>
        </div>

        {/* Orb */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <Orb mood={orbMood} size={100} />
        </div>

        {/* ── Profile Section ── */}
        <div style={{ marginBottom: 28, animation: "fadeUp 0.5s ease 0.05s both" }}>
          <p style={labelStyle}>Your name</p>
          <div style={fieldBox}>
            <input
              type="text"
              value={profile.name}
              onChange={e => updateProfile({ name: e.target.value })}
              placeholder="Enter your name"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 28, animation: "fadeUp 0.5s ease 0.08s both" }}>
          <p style={labelStyle}>Your address</p>
          <div style={fieldBox}>
            <input
              type="text"
              value={profile.address}
              onChange={e => updateProfile({ address: e.target.value })}
              placeholder="e.g. 14 Maple Street, Toronto"
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Medications Section ── */}
        <div style={{ marginBottom: 28, animation: "fadeUp 0.5s ease 0.1s both" }}>
          <p style={labelStyle}>Your medications</p>

          {profile.medications.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {profile.medications.map((med, i) => (
                <div key={i} style={{
                  ...fieldBox,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px",
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 400, color: "#2a1a08" }}>{med.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>{med.dose} · {med.time}</div>
                  </div>
                  <button onClick={() => removeMed(i)} style={{
                    background: "none", border: "none", cursor: "pointer", color: "rgba(200,80,60,0.5)",
                    fontSize: 18, lineHeight: 1, padding: "4px 8px",
                  }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Add new med form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ ...fieldBox, flex: 2, padding: "10px 14px" }}>
                <input type="text" value={newMedName} onChange={e => setNewMedName(e.target.value)} placeholder="Medicine name" style={{ ...inputStyle, fontSize: 13 }} />
              </div>
              <div style={{ ...fieldBox, flex: 1, padding: "10px 14px" }}>
                <input type="text" value={newMedDose} onChange={e => setNewMedDose(e.target.value)} placeholder="Dose" style={{ ...inputStyle, fontSize: 13 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ ...fieldBox, flex: 1, padding: "10px 14px" }}>
                <input type="text" value={newMedTime} onChange={e => setNewMedTime(e.target.value)} placeholder="e.g. 8:00 AM" style={{ ...inputStyle, fontSize: 13 }} />
              </div>
              <button onClick={addMed} disabled={!newMedName.trim() || !newMedDose.trim() || !newMedTime.trim()} style={{
                background: newMedName.trim() && newMedDose.trim() && newMedTime.trim() ? "linear-gradient(135deg, #f5c084, #c87840)" : "rgba(200,160,100,0.1)",
                color: newMedName.trim() && newMedDose.trim() && newMedTime.trim() ? "white" : "rgba(60,40,20,0.2)",
                border: "none", borderRadius: 16, padding: "10px 20px",
                fontSize: 13, fontWeight: 500, cursor: newMedName.trim() ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}>Add</button>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "rgba(60,40,20,0.3)", marginTop: 8, fontWeight: 300 }}>
            Ember will send you a notification when it&apos;s time for each medicine.
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(200,160,100,0.1)", margin: "0 0 28px" }} />

        {/* Pi URL */}
        <div style={{ marginBottom: 24, animation: "fadeUp 0.5s ease 0.15s both" }}>
          <p style={labelStyle}>remembR Pi address (Tailscale)</p>
          <div style={fieldBox}>
            <input
              type="text"
              value={piUrl}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder="http://remembr-pi.tail1234.ts.net:8000"
              style={inputStyle}
            />
          </div>
          <p style={{ fontSize: 11, color: "rgba(60,40,20,0.3)", marginTop: 6, fontWeight: 300 }}>
            Use your Pi&apos;s Tailscale hostname or IP (e.g., http://100.x.y.z:8000).
          </p>
        </div>

        {/* Test connection */}
        <div style={{ marginBottom: 28, animation: "fadeUp 0.5s ease 0.2s both" }}>
          <button
            onClick={testConnection}
            disabled={testStatus === "testing"}
            style={{
              width: "100%",
              background: testStatus === "testing"
                ? "rgba(200,160,100,0.15)"
                : testStatus === "connected"
                ? "linear-gradient(135deg, #a8c8a0, #78a870)"
                : testStatus === "failed"
                ? "rgba(200,80,60,0.08)"
                : "linear-gradient(135deg, #f5c084, #c87840)",
              color: testStatus === "testing"
                ? "rgba(60,40,20,0.3)"
                : testStatus === "failed"
                ? "rgba(180,60,40,0.7)"
                : "white",
              border: testStatus === "failed" ? "1px solid rgba(200,80,60,0.2)" : "none",
              borderRadius: 16,
              padding: "18px",
              fontSize: 15,
              fontWeight: 400,
              cursor: testStatus === "testing" ? "not-allowed" : "pointer",
              boxShadow: testStatus === "connected"
                ? "0 6px 24px rgba(100,160,80,0.25)"
                : testStatus === "testing" || testStatus === "failed"
                ? "none"
                : "0 6px 24px rgba(200,120,64,0.25)",
              transition: "all 0.25s",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              letterSpacing: "0.02em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {testStatus === "testing" && "Testing connection…"}
            {testStatus === "connected" && (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Connected
              </>
            )}
            {testStatus === "failed" && "Connection failed — try again"}
            {testStatus === null && "Test connection"}
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(200,160,100,0.1)", margin: "0 0 28px" }} />

        {/* Demo mode toggle */}
        <div style={{ animation: "fadeUp 0.5s ease 0.25s both" }}>
          <button
            onClick={handleDemoToggle}
            style={{
              width: "100%",
              background: "rgba(255,252,248,0.95)",
              border: "1px solid rgba(200,160,100,0.2)",
              borderRadius: 16,
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              boxShadow: "0 2px 12px rgba(120,80,40,0.06)",
              transition: "all 0.2s",
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: 20, fontWeight: 400, color: "#2a1a08", marginBottom: 2,
              }}>
                Demo mode
              </div>
              <div style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>
                Always use simulated scanning
              </div>
            </div>
            {/* Toggle pill */}
            <div style={{
              width: 44, height: 26, borderRadius: 13,
              background: demoMode ? "linear-gradient(135deg, #f5c084, #c87840)" : "rgba(200,160,100,0.15)",
              position: "relative",
              flexShrink: 0,
              transition: "background 0.25s",
              boxShadow: demoMode ? "0 2px 8px rgba(200,120,64,0.3)" : "none",
            }}>
              <div style={{
                width: 20, height: 20,
                borderRadius: "50%",
                background: "white",
                position: "absolute",
                top: 3,
                left: demoMode ? 21 : 3,
                transition: "left 0.25s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              }} />
            </div>
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
