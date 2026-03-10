"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import { getUserName, getUserProfile } from "@/lib/memory";

interface TimelineItem {
  id: string;
  label: string;
  sub: string;
  time: string;
  minutes: number;
  isMed: boolean;
  done: boolean;
  current: boolean;
  past: boolean;
}

function parseMinutes(timeStr: string): number {
  const [timePart, period] = timeStr.split(" ");
  const [h, m] = timePart.split(":").map(Number);
  let hour = h;
  if (period === "PM" && h !== 12) hour += 12;
  if (period === "AM" && h === 12) hour = 0;
  return hour * 60 + m;
}

function getSectionLabel(minutes: number): string {
  if (minutes < 720) return "Morning";
  if (minutes < 1020) return "Afternoon";
  return "Evening";
}

export default function Home() {
  const router = useRouter();
  const h = new Date().getHours();
  const [userName, setUserName] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);

  const greeting =
    h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const date = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long" });

  useEffect(() => {
    const name = getUserName();
    setUserName(name);
    const msg = `${greeting}, ${name}. It's ${day}, ${date}. I'm here with you today.`;
    const t1 = setTimeout(() => setSubtitle(msg), 1500);
    const t2 = setTimeout(() => setSubtitle(null), 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const profile = getUserProfile();
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Build schedule items from profile (caregiver-configured)
    const scheduleSource =
      profile.schedule.length > 0
        ? profile.schedule
        : [
            { time: "8:00 AM", label: "Breakfast", section: "Morning" as const },
            { time: "12:00 PM", label: "Lunch", section: "Afternoon" as const },
            { time: "6:00 PM", label: "Dinner", section: "Evening" as const },
            { time: "9:00 PM", label: "Wind down", section: "Evening" as const },
          ];

    const scheduleItems: TimelineItem[] = scheduleSource.map((item, i) => ({
      id: `sched-${i}`,
      label: item.label,
      sub: item.time,
      time: item.time,
      minutes: parseMinutes(item.time),
      isMed: false,
      done: false,
      current: false,
      past: false,
    }));

    // Fetch medications from Supabase
    fetch("/api/medications")
      .then((res) => res.json())
      .then((data) => {
        const meds = (data.medications || []) as {
          id: string;
          name: string;
          schedule: string;
          taken_today: boolean;
        }[];

        const medItems: TimelineItem[] = meds.map((med) => {
          // Try to parse a time from the schedule string, default to 8:00 AM
          const timeMatch = med.schedule.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          const medTime = timeMatch ? timeMatch[1] : "8:00 AM";
          return {
            id: `med-${med.id}`,
            label: med.name,
            sub: `${med.schedule}`,
            time: medTime,
            minutes: parseMinutes(medTime),
            isMed: true,
            done: med.taken_today,
            current: false,
            past: false,
          };
        });

        // Merge and sort
        const all = [...scheduleItems, ...medItems].sort((a, b) => a.minutes - b.minutes);

        // Determine current
        let foundCurrent = false;
        const final = all.map((item) => {
          const pastDue = item.minutes + 30 < nowMins;
          // Only meds use "done" — schedule items just get "past" for fading
          const done = item.isMed ? item.done : false;
          const past = !item.isMed && pastDue;
          const current = !foundCurrent && !done && !past && item.minutes <= nowMins + 30;
          if (current) foundCurrent = true;
          return { ...item, done, past, current };
        });

        setTimeline(final);
      })
      .catch(() => {
        // Fallback: just show schedule without meds
        let foundCurrent = false;
        const final = scheduleItems.map((item) => {
          const pastDue = item.minutes + 30 < nowMins;
          const current = !foundCurrent && !pastDue && item.minutes <= nowMins + 30;
          if (current) foundCurrent = true;
          return { ...item, past: pastDue, current };
        });
        setTimeline(final);
      });
  }, []);

  const toggleMed = (id: string) => {
    setTimeline((prev) =>
      prev.map((item) => {
        if (item.id === id && item.isMed) {
          const newDone = !item.done;
          if (newDone) {
            setFlash(id);
            setTimeout(() => setFlash(null), 600);
          }
          // Update Supabase
          const supabaseId = id.replace("med-", "");
          fetch("/api/medications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: supabaseId, taken_today: newDone }),
          }).catch((err) => console.error("Error updating medication:", err));

          return { ...item, done: newDone };
        }
        return item;
      })
    );
  };

  const [showFullSchedule, setShowFullSchedule] = useState(false);

  // Group timeline by section
  const sections = ["Morning", "Afternoon", "Evening"] as const;
  const medItems = timeline.filter((t) => t.isMed);
  const medsTaken = medItems.filter((t) => t.done).length;
  const medsTotal = medItems.length;

  // Find the single next thing to do
  const nextItem = timeline.find(item => !item.done && !item.past) || timeline[timeline.length - 1];

  return (
    <PageWrapper>
      <div style={{ padding: "0 24px 120px", animation: "fadeUp 0.35s ease both" }}>
        {/* Header */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "flex-start",
          marginTop: 8,
          marginBottom: 32,
          animation: "fadeUp 0.6s ease both" 
        }}>
          <div>
            <p style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: 12,
              color: "rgba(60,40,20,0.35)",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4
            }}>
              {day}, {date}
            </p>
            <h1 style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 34,
              fontWeight: 300,
              lineHeight: 1.1,
              color: "#2a1a08",
            }}>
              {greeting},<br />
              <span style={{ fontStyle: "italic", color: "#c87840" }}>{userName || "there"}</span>
            </h1>
          </div>
          <button
            onClick={() => router.push("/settings")}
            style={{
              background: "rgba(255,248,236,0.6)",
              border: "1px solid rgba(200,160,100,0.15)",
              borderRadius: "50%",
              width: 42,
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "rgba(60,40,20,0.45)",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 12px rgba(120,80,40,0.05)"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* Centerpiece: Next Up Card */}
        <div style={{ marginBottom: 32, animation: "fadeUp 0.7s ease 0.1s both" }}>
          <div style={{
            background: "linear-gradient(165deg, #fffdfa 0%, #fef8f0 100%)",
            borderRadius: 32,
            padding: "28px 24px",
            border: "1px solid rgba(200,160,100,0.12)",
            boxShadow: "0 20px 60px rgba(120,80,40,0.06)",
            position: "relative",
            overflow: "hidden"
          }}>
            {/* Visual background element */}
            <div style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 140,
              height: 140,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(245,192,132,0.12) 0%, transparent 70%)",
              zIndex: 0
            }} />

            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ 
                  fontSize: 11, 
                  background: nextItem?.isMed ? "rgba(200,120,64,0.08)" : "rgba(168,200,160,0.08)",
                  color: nextItem?.isMed ? "#c87840" : "#5a8a52",
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}>
                  {nextItem?.isMed ? "Medicine Next" : "Upcoming"}
                </span>
                <span style={{ fontSize: 13, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>
                  {nextItem?.time}
                </span>
              </div>

              <h2 style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: 42,
                fontWeight: 300,
                color: "#2a1a08",
                margin: "0 0 8px",
                lineHeight: 1.1
              }}>
                {nextItem?.label}
              </h2>
              
              <p style={{
                fontSize: 16,
                color: "rgba(60,40,20,0.55)",
                fontWeight: 300,
                margin: "0 0 24px",
                lineHeight: 1.5
              }}>
                {nextItem?.isMed ? `It's time for your ${nextItem.label}. Please take your prescribed dose.` : `Next scheduled activity: ${nextItem?.label}.`}
              </p>

              {nextItem?.isMed ? (
                <button
                  onClick={() => toggleMed(nextItem.id)}
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #f5c084, #c87840)",
                    color: "white",
                    border: "none",
                    borderRadius: 20,
                    padding: "18px",
                    fontSize: 17,
                    fontWeight: 500,
                    cursor: "pointer",
                    boxShadow: "0 8px 32px rgba(200,120,64,0.25)",
                    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  I've taken this
                </button>
              ) : (
                <div style={{ height: 2, background: "rgba(200,160,100,0.08)", borderRadius: 1 }} />
              )}
            </div>
          </div>
        </div>

        {/* Action Hub */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr", 
          gap: 16, 
          marginBottom: 40,
          animation: "fadeUp 0.7s ease 0.2s both" 
        }}>
          <button
            onClick={() => router.push("/scan")}
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(200,160,100,0.12)",
              borderRadius: 24,
              padding: "20px 16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 4px 15px rgba(120,80,40,0.03)"
            }}
          >
            <div style={{ 
              width: 44, 
              height: 44, 
              borderRadius: 14, 
              background: "rgba(200,120,64,0.06)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center" 
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c87840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#2a1a08" }}>Scan Meds</span>
          </button>

          <button
            onClick={() => router.push("/find")}
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(200,160,100,0.12)",
              borderRadius: 24,
              padding: "20px 16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 4px 15px rgba(120,80,40,0.03)"
            }}
          >
            <div style={{ 
              width: 44, 
              height: 44, 
              borderRadius: 14, 
              background: "rgba(168,200,160,0.1)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center" 
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5a8a52" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
                <path d="M11 8v6" />
                <path d="M8 11h6" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#2a1a08" }}>Find Items</span>
          </button>
        </div>

        {/* Collapsible Daily Schedule */}
        <div style={{ animation: "fadeUp 0.7s ease 0.3s both" }}>
          <button 
            onClick={() => setShowFullSchedule(!showFullSchedule)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "none",
              border: "none",
              padding: "0 0 16px",
              cursor: "pointer",
              borderBottom: "1px solid rgba(200,160,100,0.1)"
            }}
          >
            <span style={{ 
              fontSize: 14, 
              fontWeight: 500, 
              color: "#2a1a08",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              letterSpacing: "0.02em"
            }}>
              Today's Schedule
            </span>
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="rgba(60,40,20,0.4)" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{ transform: showFullSchedule ? "rotate(180deg)" : "none", transition: "transform 0.3s ease" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showFullSchedule && (
            <div style={{ 
              paddingTop: 16, 
              animation: "fadeIn 0.4s ease both",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}>
              {sections.map((section) => {
                const sectionItems = timeline.filter(t => getSectionLabel(t.minutes) === section);
                if (sectionItems.length === 0) return null;
                return (
                  <div key={section} style={{ marginBottom: 16 }}>
                    <p style={{
                      fontSize: 10,
                      color: "rgba(60,40,20,0.3)",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                      fontWeight: 600
                    }}>
                      {section}
                    </p>
                    {sectionItems.map((item) => (
                      <div key={item.id} style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center",
                        padding: "10px 0",
                        opacity: item.past || item.done ? 0.4 : 1
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ 
                            width: 6, 
                            height: 6, 
                            borderRadius: "50%", 
                            background: item.done ? "#5a8a52" : item.isMed ? "#c87840" : "#d8c8b0" 
                          }} />
                          <span style={{ 
                            fontSize: 15, 
                            color: "#2a1a08", 
                            fontWeight: 300,
                            textDecoration: item.done ? "line-through" : "none"
                          }}>
                            {item.label}
                          </span>
                        </div>
                        <span style={{ fontSize: 13, color: "rgba(60,40,20,0.35)", fontWeight: 300 }}>
                          {item.time}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Medication Progress Ring/Status */}
        <div style={{ 
          marginTop: 48, 
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          animation: "fadeIn 1s ease 0.4s both"
        }}>
          <Orb mood={medsTotal > 0 && medsTaken === medsTotal ? "happy" : "idle"} size={80} />
          <p style={{ 
            marginTop: 16,
            fontSize: 12, 
            color: "rgba(60,40,20,0.4)", 
            fontWeight: 300,
            textAlign: "center"
          }}>
            {medsTaken === medsTotal 
              ? `All ${medsTotal} medications taken today.` 
              : `${medsTaken} of ${medsTotal} medications recorded.`}
          </p>
          <button
            onClick={() => router.push("/summary")}
            style={{
              marginTop: 16,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: "#c87840",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "8px 16px"
            }}
          >
            Caregiver Report →
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
