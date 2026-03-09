"use client";

import { useState, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import { getUserProfile } from "@/lib/memory";

interface ScheduleItem {
  time: string;
  label: string;
  section: "Morning" | "Afternoon" | "Evening";
  done: boolean;
  current: boolean;
}

function parseHour(timeStr: string): number {
  const [timePart, period] = timeStr.split(" ");
  const [h, m] = timePart.split(":").map(Number);
  let hour = h;
  if (period === "PM" && h !== 12) hour += 12;
  if (period === "AM" && h === 12) hour = 0;
  return hour * 60 + m;
}

const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

export default function Day() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    const profile = getUserProfile();
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Build schedule from profile, or show a default if empty
    const items = profile.schedule.length > 0
      ? profile.schedule
      : [
          { time: "8:00 AM",  label: "Breakfast",  section: "Morning" as const },
          { time: "12:00 PM", label: "Lunch",      section: "Afternoon" as const },
          { time: "6:00 PM",  label: "Dinner",     section: "Evening" as const },
          { time: "9:00 PM",  label: "Wind down",  section: "Evening" as const },
        ];

    // Also insert medication times from profile
    const medItems = profile.medications.map(med => {
      const [, period] = med.time.split(" ");
      const h = parseHour(med.time);
      let section: "Morning" | "Afternoon" | "Evening" = "Morning";
      if (h >= 720) section = "Afternoon";
      if (h >= 1020) section = "Evening";
      return {
        time: med.time,
        label: `${med.name} (${med.dose})`,
        section,
      };
    });

    const allItems = [...items, ...medItems].sort((a, b) => parseHour(a.time) - parseHour(b.time));

    // Determine done/current based on current time
    let foundCurrent = false;
    const withStatus: ScheduleItem[] = allItems.map(item => {
      const itemMins = parseHour(item.time);
      const done = itemMins + 30 < nowMins; // Consider done if 30+ mins past
      const current = !foundCurrent && !done && itemMins <= nowMins + 30;
      if (current) foundCurrent = true;
      return { ...item, done, current };
    });

    setSchedule(withStatus);
  }, []);
  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>
        <div style={{ animation: "fadeUp 0.5s ease both", marginBottom: 28 }}>
          <p style={{ fontSize: 11, color: "rgba(60,40,20,0.35)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>{dateStr}</p>
          <h2 style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, color: "#2a1a08", letterSpacing: "-0.3px", lineHeight: 1.1 }}>
            My <em style={{ color: "#c87840" }}>day</em>
          </h2>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <Orb mood="idle" size={90} />
        </div>

        <div style={{ animation: "fadeUp 0.5s ease 0.15s both" }}>
          {(["Morning", "Afternoon", "Evening"] as const).map((section, si) => (
            <div key={section} style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 11, color: "rgba(60,40,20,0.3)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>{section}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {schedule.filter(s => s.section === section).map((item, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: item.current ? "14px 12px" : "14px 0",
                    borderBottom: "1px solid rgba(200,160,100,0.07)",
                    opacity: item.done ? 0.38 : 1,
                    background: item.current ? "rgba(245,192,132,0.06)" : "transparent",
                    borderRadius: item.current ? 12 : 0,
                    transition: "all 0.2s",
                    animation: `fadeUp 0.4s ease ${si * 0.1 + i * 0.05}s both`,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: item.done ? "#c8d8c0" : item.current ? "#f5c084" : "rgba(200,160,100,0.2)",
                      boxShadow: item.current ? "0 0 10px rgba(245,192,132,0.6)" : "none",
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 20, fontWeight: item.current ? 400 : 300, color: "#2a1a08", textDecoration: item.done ? "line-through" : "none" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(60,40,20,0.35)", marginTop: 2 }}>{item.time}</div>
                    </div>
                    {item.current && <span style={{ fontSize: 11, background: "rgba(200,120,64,0.12)", color: "#c87840", padding: "4px 10px", borderRadius: 20, fontWeight: 500, letterSpacing: "0.04em" }}>Now</span>}
                    {item.done && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a8c8a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
