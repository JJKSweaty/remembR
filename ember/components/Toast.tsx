"use client";

import { useState, useEffect, useRef } from "react";

interface ToastItem { id: number; message: string; }

let toastCounter = 0;

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const handler = (e: Event) => {
      const message = (e as CustomEvent<{ message: string }>).detail.message;
      const id = ++toastCounter;
      setToasts(prev => [...prev, { id, message }]);

      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timersRef.current.delete(id);
      }, 5000);
      timersRef.current.set(id, timer);
    };

    window.addEventListener("ember-toast", handler);
    return () => {
      window.removeEventListener("ember-toast", handler);
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "100%",
      maxWidth: 430,
      zIndex: 999,
      pointerEvents: "none",
      padding: "12px 16px 0",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: "rgba(254,248,236,0.97)",
          border: "1px solid rgba(200,160,100,0.25)",
          borderRadius: 16,
          padding: "12px 18px",
          boxShadow: "0 4px 24px rgba(120,80,40,0.12)",
          animation: "slideDown 0.3s ease both",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#c87840", flexShrink: 0, marginTop: 6,
          }} />
          <p style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: 16,
            fontWeight: 300,
            color: "#c87840",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}>
            {t.message}
          </p>
        </div>
      ))}
    </div>
  );
}
