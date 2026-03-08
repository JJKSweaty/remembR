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

  // Group timeline by section
  const sections = ["Morning", "Afternoon", "Evening"] as const;
  const medItems = timeline.filter((t) => t.isMed);
  const medsTaken = medItems.filter((t) => t.done).length;
  const medsTotal = medItems.length;

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>
        {/* Greeting */}
        <div style={{ animation: "fadeUp 0.6s ease both", marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                fontSize: 13,
                color: "rgba(60,40,20,0.4)",
                fontWeight: 300,
                letterSpacing: "0.02em",
              }}
            >
              {greeting}
              {userName ? `, ${userName}` : ""} —
            </p>
            <button
              onClick={() => router.push("/settings")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "rgba(60,40,20,0.3)",
                lineHeight: 0,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
          <h1
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 44,
              fontWeight: 300,
              lineHeight: 1.05,
              color: "#2a1a08",
              letterSpacing: "-0.5px",
            }}
          >
            {day}
            <br />
            <span style={{ fontStyle: "italic", color: "#c87840" }}>{date}</span>
          </h1>
        </div>

        {/* Orb */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            margin: "32px 0 28px",
            gap: 12,
            animation: "fadeIn 1s ease 0.2s both",
          }}
        >
          <Orb mood={medsTotal > 0 && medsTaken === medsTotal ? "happy" : "idle"} size={120} />
          {subtitle && (
            <p
              style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: 15,
                fontStyle: "italic",
                color: "rgba(60,40,20,0.45)",
                textAlign: "center",
                animation: "fadeIn 0.5s ease both",
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* Medication progress (only if meds exist) */}
        {medsTotal > 0 && (
          <div style={{ marginBottom: 24, animation: "fadeUp 0.5s ease 0.1s both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", fontWeight: 300 }}>
                Medications
              </span>
              <span style={{ fontSize: 12, color: "#c87840", fontWeight: 500 }}>
                {medsTaken} of {medsTotal}
              </span>
            </div>
            <div
              style={{
                height: 3,
                background: "rgba(200,160,100,0.12)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${medsTotal > 0 ? (medsTaken / medsTotal) * 100 : 0}%`,
                  background: "linear-gradient(90deg, #f5c084, #c87840)",
                  borderRadius: 2,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Merged Timeline */}
        <div style={{ animation: "fadeUp 0.5s ease 0.15s both" }}>
          {sections.map((section, si) => {
            const sectionItems = timeline.filter(
              (t) => getSectionLabel(t.minutes) === section
            );
            if (sectionItems.length === 0) return null;
            return (
              <div key={section} style={{ marginBottom: 24 }}>
                <p
                  style={{
                    fontSize: 11,
                    color: "rgba(60,40,20,0.3)",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  {section}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {sectionItems.map((item, i) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: item.current ? "14px 12px" : "14px 0",
                        borderBottom: "1px solid rgba(200,160,100,0.07)",
                        opacity: item.done ? 0.4 : item.past ? 0.55 : 1,
                        background: item.current
                          ? "rgba(245,192,132,0.06)"
                          : "transparent",
                        borderRadius: item.current ? 12 : 0,
                        transition: "all 0.2s",
                        animation: `fadeUp 0.4s ease ${si * 0.1 + i * 0.05}s both`,
                      }}
                    >
                      {/* Dot / Med indicator */}
                      <div
                        style={{
                          width: item.isMed ? 10 : 8,
                          height: item.isMed ? 10 : 8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: item.done
                            ? "#c8d8c0"
                            : item.current
                            ? "#f5c084"
                            : item.isMed
                            ? "rgba(200,120,64,0.35)"
                            : "rgba(200,160,100,0.2)",
                          boxShadow: item.current
                            ? "0 0 10px rgba(245,192,132,0.6)"
                            : "none",
                        }}
                      />

                      {/* Content */}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily:
                              "var(--font-cormorant), 'Cormorant Garamond', serif",
                            fontSize: 20,
                            fontWeight: item.current ? 400 : 300,
                            color: "#2a1a08",
                            textDecoration: item.done && item.isMed ? "line-through" : "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {item.isMed && (
                            <span style={{ fontSize: 14, opacity: 0.6 }}>💊</span>
                          )}
                          {item.label}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "rgba(60,40,20,0.35)",
                            marginTop: 2,
                          }}
                        >
                          {item.sub}
                        </div>
                      </div>

                      {/* Current badge or check */}
                      {item.current && !item.isMed && (
                        <span
                          style={{
                            fontSize: 11,
                            background: "rgba(200,120,64,0.12)",
                            color: "#c87840",
                            padding: "4px 10px",
                            borderRadius: 20,
                            fontWeight: 500,
                            letterSpacing: "0.04em",
                          }}
                        >
                          Now
                        </span>
                      )}

                      {/* Med toggle button */}
                      {item.isMed && (
                        <button
                          onClick={() => toggleMed(item.id)}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: item.done ? "#a8c8a0" : "transparent",
                            border: `1.5px solid ${
                              item.done ? "#a8c8a0" : "rgba(200,160,100,0.3)"
                            }`,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.25s",
                            animation:
                              flash === item.id
                                ? "checkmark 0.4s ease both"
                                : "none",
                            flexShrink: 0,
                          }}
                        >
                          {item.done && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      )}

                      {/* Schedule past indicator (subtle, no checkmark) */}
                      {!item.isMed && item.past && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "rgba(60,40,20,0.25)",
                            fontStyle: "italic",
                          }}
                        >
                          earlier
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* All meds done message */}
        {medsTotal > 0 && medsTaken === medsTotal && (
          <div
            style={{
              marginTop: 8,
              textAlign: "center",
              animation: "slideUp 0.5s ease both",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 300,
                color: "#2a1a08",
                fontStyle: "italic",
              }}
            >
              Well done{userName !== "there" ? `, ${userName}` : ""}.
            </p>
            <p
              style={{
                fontSize: 13,
                color: "rgba(60,40,20,0.4)",
                marginTop: 4,
                fontWeight: 300,
              }}
            >
              All medicines taken today.
            </p>
          </div>
        )}

        {/* Caregiver report link */}
        <div
          style={{
            marginTop: 40,
            textAlign: "center",
            animation: "fadeIn 0.5s ease 0.4s both",
          }}
        >
          <button
            onClick={() => router.push("/summary")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "rgba(60,40,20,0.3)",
              fontWeight: 300,
              letterSpacing: "0.08em",
              padding: "8px 16px",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#c87840";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(60,40,20,0.3)";
            }}
          >
            Caregiver Report →
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
