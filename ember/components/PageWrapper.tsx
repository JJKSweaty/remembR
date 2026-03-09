"use client";

import { useEffect } from "react";
import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import VoiceButton from "@/components/VoiceButton";
import { showToast } from "@/lib/voice";
import { getUserProfile } from "@/lib/memory";

interface PageWrapperProps {
  children: React.ReactNode;
}

function parseScheduledHour(timeStr: string): { h: number; m: number } {
  const [timePart, period] = timeStr.split(" ");
  const [h, m] = timePart.split(":").map(Number);
  let hour = h;
  if (period === "PM" && h !== 12) hour += 12;
  if (period === "AM" && h === 12) hour = 0;
  return { h: hour, m };
}

export default function PageWrapper({ children }: PageWrapperProps) {
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Medication reminder notifications (toast-based)
  useEffect(() => {
    const checkMeds = () => {
      if (typeof window === "undefined") return;
      const profile = getUserProfile();
      if (!profile.medications.length) return;
      const now = new Date();
      const name = profile.name || "there";
      profile.medications.forEach(med => {
        const { h, m } = parseScheduledHour(med.time);
        if (now.getHours() === h && now.getMinutes() >= m && now.getMinutes() <= m + 5) {
          const key = `ember_med_notif_${med.name}_${now.toDateString()}`;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, "1");
            showToast(`💊 Time for your ${med.name} (${med.dose}), ${name}.`);
          }
        }
      });
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
        <Nav />
      </div>
    </div>
  );
}
