"use client";

import { useState, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import { logMedication, getFullContext, getUserProfile, getUserName } from "@/lib/memory";
import { showToast } from "@/lib/voice";

type OrbMood = "idle" | "scanning" | "happy";

interface Med {
  id: number;
  name: string;
  dose: string;
  time: string;
  taken: boolean;
}

export default function Meds() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [userName, setUserName] = useState("");
  const [flash, setFlash] = useState<number | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [orbMood, setOrbMood] = useState<OrbMood>("scanning");

  // Load user profile medications
  useEffect(() => {
    const profile = getUserProfile();
    setUserName(getUserName());
    if (profile.medications.length > 0) {
      setMeds(profile.medications.map((m, i) => ({
        id: i + 1,
        name: m.name,
        dose: m.dose,
        time: m.time,
        taken: false,
      })));
    }
  }, []);

  // Fetch AI reminder on mount
  useEffect(() => {
    if (meds.length === 0) {
      setAiMessage("Add your medications in Settings to track them here.");
      setOrbMood("idle");
      return;
    }
    const fetchReminder = async () => {
      try {
        const context = getFullContext();
        const res = await fetch("/api/meds-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meds, context }),
        });
        const data = await res.json() as { message: string };
        setAiMessage(data.message);
        setOrbMood("idle");
      } catch {
        const fallback = `Here are your medicines for today.`;
        setAiMessage(fallback);
        setOrbMood("idle");
      }
    };
    fetchReminder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meds.length]);

  // Check for overdue meds (time has passed, not taken) — toast notification
  useEffect(() => {
    if (meds.length === 0) return;
    const now = new Date();
    const overdue = meds.filter(med => {
      if (med.taken) return false;
      const [timePart, period] = med.time.split(" ");
      const [h, m] = timePart.split(":").map(Number);
      let hour = h;
      if (period === "PM" && h !== 12) hour += 12;
      if (period === "AM" && h === 12) hour = 0;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, m) < now;
    });
    if (overdue.length > 0) {
      const med = overdue[0];
      const t = setTimeout(() => {
        setOrbMood("scanning");
        showToast(`💊 Don't forget your ${med.name}. You usually take it around ${med.time}.`);
        setTimeout(() => setOrbMood("idle"), 4000);
      }, 2000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meds]);

  const taken = meds.filter(m => m.taken).length;
  const all = meds.length;
  const allDone = taken === all;
  const displayOrbMood: OrbMood = allDone ? "happy" : orbMood;

  const toggle = (id: number) => {
    const med = meds.find(m => m.id === id);
    if (med && !med.taken) {
      setFlash(id);
      setTimeout(() => setFlash(null), 600);
      logMedication({ name: med.name, dose: med.dose, time: med.time, taken: true });
    }
    setMeds(m => m.map(x => x.id === id ? { ...x, taken: !x.taken } : x));
  };

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>
        <div style={{ animation: "fadeUp 0.5s ease both", marginBottom: 28 }}>
          <p style={{ fontSize: 11, color: "rgba(60,40,20,0.35)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>Today&apos;s medicines</p>
          <h2 style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, color: "#2a1a08", letterSpacing: "-0.3px", lineHeight: 1.1 }}>
            {allDone
              ? <>{`All done,`}<br /><em style={{ color: "#c87840" }}>{userName}</em></>
              : <>{`My`}<br /><em style={{ color: "#c87840" }}>medication</em></>}
          </h2>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: aiMessage ? 20 : 32 }}>
          <Orb mood={displayOrbMood} size={100} />
        </div>

        {/* AI reminder card */}
        {aiMessage && (
          <div style={{
            background: "rgba(255,248,236,0.85)",
            border: "1px solid rgba(200,160,100,0.18)",
            borderRadius: 18,
            padding: "16px 20px",
            marginBottom: 28,
            animation: "slideUp 0.4s ease both",
          }}>
            <p style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 18,
              fontWeight: 300,
              color: "#2a1a08",
              lineHeight: 1.6,
              fontStyle: "italic",
            }}>
              {aiMessage}
            </p>
          </div>
        )}

        {/* Progress */}
        <div style={{ marginBottom: 28, animation: "fadeUp 0.5s ease 0.1s both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>Progress</span>
            <span style={{ fontSize: 12, color: "#c87840", fontWeight: 500 }}>{taken} of {all}</span>
          </div>
          <div style={{ height: 3, background: "rgba(200,160,100,0.12)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(taken / all) * 100}%`, background: "linear-gradient(90deg, #f5c084, #c87840)", borderRadius: 2, transition: "width 0.5s ease" }} />
          </div>
        </div>

        {/* Med list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, animation: "fadeUp 0.5s ease 0.15s both" }}>
          {meds.map((med, i) => (
            <div key={med.id} style={{
              display: "flex", alignItems: "center",
              padding: "18px 0",
              borderBottom: "1px solid rgba(200,160,100,0.08)",
              opacity: med.taken ? 0.45 : 1,
              transition: "opacity 0.3s",
              animation: `fadeUp 0.4s ease ${0.15 + i * 0.06}s both`,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  fontSize: 22, fontWeight: 400, color: "#2a1a08", marginBottom: 3,
                  textDecoration: med.taken ? "line-through" : "none",
                }}>{med.name}</div>
                <div style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>{med.dose} · {med.time}</div>
              </div>
              <button onClick={() => toggle(med.id)} style={{
                width: 40, height: 40, borderRadius: "50%",
                background: med.taken ? "#a8c8a0" : "transparent",
                border: `1.5px solid ${med.taken ? "#a8c8a0" : "rgba(200,160,100,0.3)"}`,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.25s",
                animation: flash === med.id ? "checkmark 0.4s ease both" : "none",
                flexShrink: 0,
              }}>
                {med.taken && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>

        {allDone && (
          <div style={{ marginTop: 24, textAlign: "center", animation: "slideUp 0.5s ease both" }}>
            <p style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: "#2a1a08", fontStyle: "italic" }}>
              Well done{userName !== "there" ? `, ${userName}` : ""}.
            </p>
            <p style={{ fontSize: 13, color: "rgba(60,40,20,0.4)", marginTop: 4, fontWeight: 300 }}>All medicines taken today.</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
