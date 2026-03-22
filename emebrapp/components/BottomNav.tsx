"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Pill, MessageCircle, Search, Mic } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

function NavTab({
  icon: Icon,
  label,
  path,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  path: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 48,
        background: active ? "#EF9F27" : "transparent",
        border: "none",
        borderRadius: 30,
        cursor: "pointer",
        padding: active ? "10px 16px" : "10px 12px",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
        flexShrink: 0,
        gap: 6,
        transition: "background 0.2s",
      }}
    >
      <AnimatePresence>
        {active && (
          <motion.div
            layoutId="active-pill"
            style={{
              position: "absolute",
              inset: 0,
              background: "#EF9F27",
              borderRadius: 30,
              zIndex: 0,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
      </AnimatePresence>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={20} color={active ? "#FFFFFF" : "var(--text-muted)"} strokeWidth={2} />
        <AnimatePresence>
          {active && (
            <motion.span
              key={`label-${path}`}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15, delay: 0.05 }}
              style={{
                color: "#FFFFFF",
                fontSize: 11,
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");

  const handleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    recognitionRef.current = rec;
    transcriptRef.current = "";

    rec.onresult = (event: any) => {
      const text = event.results[0][0].transcript.replace(/\bamber\b/gi, "Ember");
      transcriptRef.current = text;
    };

    rec.onend = () => {
      setListening(false);
      const text = transcriptRef.current.trim();
      if (!text) return;
      if (pathname.startsWith("/chat")) {
        window.dispatchEvent(new CustomEvent("ember-nav-mic", { detail: { text } }));
      } else {
        router.push(`/chat?msg=${encodeURIComponent(text)}`);
      }
    };

    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };

  return (
    <>
      <style>{`
        @keyframes mic-glow {
          0%   { box-shadow: 0 0 0 0 rgba(239,159,39,0.45), 0 4px 16px rgba(239,159,39,0.4); }
          100% { box-shadow: 0 0 0 14px rgba(239,159,39,0), 0 4px 16px rgba(239,159,39,0.4); }
        }
      `}</style>
      <div style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 50,
          height: 64,
          padding: "0 8px",
          gap: 4,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}>

          <NavTab icon={Home} label="Home" path="/" active={pathname === "/"} onClick={() => router.push("/")} />
          <NavTab icon={Pill} label="Meds" path="/meds" active={pathname.startsWith("/meds")} onClick={() => router.push("/meds")} />

          {/* MIC — inline center */}
          <motion.div
            animate={listening ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={listening ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
            whileTap={{ scale: 0.88 }}
            onClick={handleMic}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: listening
                ? "radial-gradient(circle at 35% 35%, #FAD070, #EF9F27)"
                : "#EF9F27",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              animation: listening ? "mic-glow 1.5s ease-out infinite" : "none",
              boxShadow: listening ? undefined : "0 4px 16px rgba(239,159,39,0.4)",
              margin: "0 4px",
              transition: "background 0.3s",
            }}
          >
            <Mic size={20} color="white" strokeWidth={2} />
          </motion.div>

          <NavTab icon={MessageCircle} label="Chat" path="/chat" active={pathname.startsWith("/chat")} onClick={() => router.push("/chat")} />
          <NavTab icon={Search} label="Find" path="/find" active={pathname.startsWith("/find")} onClick={() => router.push("/find")} />

        </div>
      </div>
    </>
  );
}
