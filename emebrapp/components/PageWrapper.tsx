"use client";

import { useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import Toast from "@/components/Toast";
import VoiceButton from "@/components/VoiceButton";
import { showToast } from "@/lib/voice";

interface PageWrapperProps {
  children: React.ReactNode;
}

interface Med {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
  taken_today: boolean;
}

function parseScheduleMinutes(timeStr: string): number {
  const [timePart, period] = timeStr.trim().split(" ");
  const [hStr, mStr] = timePart.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (period?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period?.toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export default function PageWrapper({ children }: PageWrapperProps) {
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Medication reminder notifications — fetches from Supabase every 60s
  useEffect(() => {
    const checkMeds = async () => {
      if (typeof window === "undefined") return;
      try {
        const res = await fetch("/api/medications");
        const data = await res.json() as { medications: Med[] };
        const meds: Med[] = data.medications || [];
        if (meds.length === 0) return;

        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const today = now.toDateString();

        meds.forEach((med) => {
          if (med.taken_today) return;
          const scheduledMinutes = parseScheduleMinutes(med.schedule);
          const minutesPast = nowMinutes - scheduledMinutes;

          // Fire once per med per day, within the first 30 minutes past schedule
          if (minutesPast >= 0 && minutesPast <= 30) {
            const key = `ember_med_notif_${med.id}_${today}`;
            if (!localStorage.getItem(key)) {
              localStorage.setItem(key, "1");
              showToast(
                `💊 Time for your ${med.name} (${med.dosage}).`,
                { label: "Mark as Taken", type: "mark_taken", medId: med.id }
              );
            }
          }
        });
      } catch {
        // Silently ignore — reminders are non-critical
      }
    };

    checkMeds();
    const interval = setInterval(checkMeds, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      position: "relative",
    }}>
      <Toast />

      {/* Grain overlay */}
      <div style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.4,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
      }} />

      <div style={{ width: "100%", maxWidth: 430, position: "relative", zIndex: 1 }}>
        {/* Status bar */}
        <div style={{
          height: 52,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 28px 10px",
        }}>
          <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(60,40,20,0.4)" }}>
            {time}
          </span>
          <span style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: 16,
            fontStyle: "italic",
            color: "#c87840",
            letterSpacing: "0.02em",
          }}>
            ember
          </span>
        </div>

        {/* Page content */}
        {children}

        <VoiceButton />
        <BottomNav />
      </div>
    </div>
  );
}
