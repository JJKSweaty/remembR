"use client";

import { useState, useEffect, useRef } from "react";
import type { ToastAction } from "@/lib/voice";

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

let toastCounter = 0;

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, action } = (e as CustomEvent<{ message: string; action?: ToastAction }>).detail;
      const id = ++toastCounter;
      setToasts(prev => [...prev, { id, message, action }]);

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

  const dismiss = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  };

  const handleAction = async (toast: ToastItem) => {
    dismiss(toast.id);
    try {
      await toast.action?.onAction?.();
    } catch {
      // Silently ignore — toast already dismissed
    }
  };

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
        <div
          key={t.id}
          style={{
            pointerEvents: "auto",
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: "12px 18px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            animation: "slideDown 0.3s ease both",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#EF9F27", flexShrink: 0, marginTop: 6,
          }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 16,
              fontWeight: 300,
              color: "#EF9F27",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}>
              {t.message}
            </p>

            {t.action?.type === "mark_taken" && (
              <button
                onClick={() => handleAction(t)}
                style={{
                  marginTop: 8,
                  background: "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 20,
                  padding: "7px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
