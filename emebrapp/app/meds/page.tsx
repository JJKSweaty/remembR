"use client";

import { useState, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import MedCard from "@/components/MedCard";
import ProgressRing from "@/components/ProgressRing";
import { logMedication, getFullContext } from "@/lib/memory";
import { showToast } from "@/lib/voice";

type OrbMood = "idle" | "scanning" | "happy";

interface Med {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
  taken_today: boolean;
  taken_at?: string | null;
}

export default function Meds() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [orbMood, setOrbMood] = useState<OrbMood>("scanning");

  // Load medications from Supabase (GET handles midnight reset automatically)
  useEffect(() => {
    const fetchMeds = async () => {
      try {
        const res = await fetch("/api/medications");
        const data = await res.json() as { medications: Med[] };
        setMeds(data.medications || []);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchMeds();
  }, []);

  // Fetch AI reminder once meds are loaded
  useEffect(() => {
    if (loading) return;
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
      } catch {
        setAiMessage("Here are your medicines for today.");
      } finally {
        setOrbMood("idle");
      }
    };
    fetchReminder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Toast for the first overdue med when page loads
  useEffect(() => {
    if (loading || meds.length === 0) return;
    const now = new Date();
    const overdue = meds.find((med) => {
      if (med.taken_today) return false;
      const [timePart, period] = med.schedule.trim().split(" ");
      const [hStr, mStr] = timePart.split(":");
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr ?? "0", 10);
      if (period?.toUpperCase() === "PM" && h !== 12) h += 12;
      if (period?.toUpperCase() === "AM" && h === 12) h = 0;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m) < now;
    });
    if (!overdue) return;
    const t = setTimeout(() => {
      setOrbMood("scanning");
      showToast(`💊 Don't forget your ${overdue.name}. Due at ${overdue.schedule}.`);
      setTimeout(() => setOrbMood("idle"), 4000);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleToggle = async (id: string, taken: boolean) => {
    // Optimistic update
    setMeds((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, taken_today: taken, taken_at: taken ? new Date().toISOString() : null }
          : m
      )
    );

    // Local backup for AI context
    const med = meds.find((m) => m.id === id);
    if (med && taken) {
      logMedication({ name: med.name, dose: med.dosage, time: med.schedule, taken: true });
    }

    try {
      const res = await fetch("/api/medications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, taken_today: taken }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on failure
      setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, taken_today: !taken } : m)));
      showToast("Couldn't save. Please try again.");
    }
  };

  const taken = meds.filter((m) => m.taken_today).length;
  const total = meds.length;
  const allDone = total > 0 && taken === total;
  const displayOrbMood: OrbMood = allDone ? "happy" : orbMood;

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>

        {/* Header */}
        <div style={{ animation: "fadeUp 0.5s ease both", marginBottom: 28 }}>
          <p style={{
            fontSize: 11,
            color: "rgba(60,40,20,0.35)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}>
            Today&apos;s medicines
          </p>
          <h2 style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: 40,
            fontWeight: 300,
            color: "#2a1a08",
            letterSpacing: "-0.3px",
            lineHeight: 1.1,
          }}>
            {allDone
              ? <>All done</>
              : <>My<br /><em style={{ color: "#c87840" }}>medication</em></>}
          </h2>
        </div>

        {/* Orb + Progress Ring */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
          marginBottom: aiMessage ? 20 : 32,
        }}>
          <Orb mood={displayOrbMood} size={100} />
          {total > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <ProgressRing taken={taken} total={total} size={64} />
              <span style={{ fontSize: 11, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>
                {taken} of {total}
              </span>
            </div>
          )}
        </div>

        {/* AI reminder */}
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

        {/* Progress bar */}
        {total > 0 && (
          <div style={{ marginBottom: 28, animation: "fadeUp 0.5s ease 0.1s both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>Progress</span>
              <span style={{ fontSize: 12, color: "#c87840", fontWeight: 500 }}>{taken} of {total}</span>
            </div>
            <div style={{ height: 3, background: "rgba(200,160,100,0.12)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${total === 0 ? 0 : (taken / total) * 100}%`,
                background: allDone ? "#a8c8a0" : "linear-gradient(90deg, #f5c084, #c87840)",
                borderRadius: 2,
                transition: "width 0.5s ease, background 0.4s ease",
              }} />
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ fontSize: 14, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>Loading...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && loadError && (
          <div style={{ textAlign: "center", padding: "32px 0", animation: "fadeUp 0.4s ease both" }}>
            <p style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 20,
              fontWeight: 300,
              color: "rgba(60,40,20,0.5)",
              fontStyle: "italic",
            }}>
              Something went wrong.
            </p>
            <p style={{ fontSize: 13, color: "rgba(60,40,20,0.35)", marginTop: 6, fontWeight: 300 }}>
              Check your connection and refresh the page.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && total === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", animation: "fadeUp 0.4s ease both" }}>
            <p style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 20,
              fontWeight: 300,
              color: "rgba(60,40,20,0.5)",
              fontStyle: "italic",
            }}>
              No medications added yet.
            </p>
            <p style={{ fontSize: 13, color: "rgba(60,40,20,0.35)", marginTop: 6, fontWeight: 300 }}>
              Visit Settings to add your medications.
            </p>
          </div>
        )}

        {/* Med list */}
        {!loading && total > 0 && (
          <div style={{ display: "flex", flexDirection: "column", animation: "fadeUp 0.5s ease 0.15s both" }}>
            {meds.map((med, i) => (
              <MedCard
                key={med.id}
                id={med.id}
                name={med.name}
                dosage={med.dosage}
                schedule={med.schedule}
                taken_today={med.taken_today}
                onToggle={handleToggle}
                animationDelay={0.15 + i * 0.06}
              />
            ))}
          </div>
        )}

        {/* All done message */}
        {allDone && (
          <div style={{ marginTop: 24, textAlign: "center", animation: "slideUp 0.5s ease both" }}>
            <p style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 22,
              fontWeight: 300,
              color: "#2a1a08",
              fontStyle: "italic",
            }}>
              Well done. All medicines taken today.
            </p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
