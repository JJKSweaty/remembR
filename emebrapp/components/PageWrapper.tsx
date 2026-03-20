"use client";

import { useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import Toast from "@/components/Toast";
import { showToast } from "@/lib/voice";
import { parseTimeToMinutes } from "@/lib/time";

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

export default function PageWrapper({ children }: PageWrapperProps) {

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
          const scheduledMinutes = parseTimeToMinutes(med.schedule);
          const minutesPast = nowMinutes - scheduledMinutes;

          // Fire once per med per day, within the first 30 minutes past schedule
          if (minutesPast >= 0 && minutesPast <= 30) {
            const key = `ember_med_notif_${med.id}_${today}`;
            if (!localStorage.getItem(key)) {
              localStorage.setItem(key, "1");
              showToast(
                `💊 Time for your ${med.name} (${med.dosage}).`,
                {
                  label: "Mark as Taken",
                  type: "mark_taken",
                  medId: med.id,
                  onAction: async () => {
                    await fetch("/api/medications", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: med.id, taken_today: true }),
                    });
                  },
                }
              );
            }
          }
        });
      } catch {
        // Silently ignore — reminders are non-critical
      }
    };

    // Delay initial check 5s so it doesn't pile onto page-load fetches
    const initial = setTimeout(checkMeds, 5_000);
    const interval = setInterval(checkMeds, 60_000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      background: "transparent",
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>
      <Toast />
      <div style={{ width: "100%", maxWidth: 430, position: "relative" }}>
        {children}
        <BottomNav />
      </div>
    </div>
  );
}
