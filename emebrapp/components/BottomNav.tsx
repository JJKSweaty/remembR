"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Pill, MessageCircle, Search } from "lucide-react";
import { motion } from "framer-motion";
import { speak, preloadVoices } from "@/lib/speech";

type ListeningState = "idle" | "listening" | "processing";

const LEFT_TABS  = [
  { href: "/",     label: "Home", icon: Home },
  { href: "/meds", label: "Meds", icon: Pill },
] as const;

const RIGHT_TABS = [
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/find", label: "Find", icon: Search },
] as const;

const NAV_CSS = `
  @keyframes micPulse {
    0%, 100% { transform: translateX(-50%) scale(1); }
    50%       { transform: translateX(-50%) scale(1.08); }
  }
  @keyframes navSpin {
    to { transform: rotate(360deg); }
  }
`;

export default function BottomNav() {
  const pathname = usePathname();

  const [voiceState, setVoiceState] = useState<ListeningState>("idle");
  const [transcript, setTranscript]  = useState("");
  const [response, setResponse]      = useState<string | null>(null);

  const recognitionRef   = useRef<any>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef    = useRef("");

  useEffect(() => { preloadVoices(); }, []);

  const clearResponseAfterDelay = (ms = 5000) => {
    if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    responseTimerRef.current = setTimeout(() => {
      setResponse(null);
      setTranscript("");
    }, ms);
  };

  const processVoice = async (text: string) => {
    if (!text.trim()) { setVoiceState("idle"); return; }
    setVoiceState("processing");
    setResponse(null);
    try {
      const res  = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      if (data._debug) {
        setResponse("Error: " + data._debug);
        clearResponseAfterDelay(12000);
        setVoiceState("idle");
        return;
      }
      if (data.spokenResponse) {
        setResponse(data.spokenResponse);
        speak(data.spokenResponse);
        clearResponseAfterDelay(8000);
      }
      setVoiceState("idle");
    } catch {
      const fallback = "I'm sorry, I couldn't process that right now. Try again in a moment.";
      setResponse(fallback);
      speak(fallback);
      setVoiceState("idle");
      clearResponseAfterDelay();
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setResponse("Voice input isn't supported in this browser. Try Safari or Chrome.");
      clearResponseAfterDelay();
      return;
    }

    setVoiceState("listening");
    setTranscript("");
    transcriptRef.current = "";
    setResponse(null);

    const recognition = new SpeechRecognition();
    recognition.lang            = "en-US";
    recognition.interimResults  = true;
    recognition.continuous      = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current      = recognition;

    recognition.onresult = (event: any) => {
      let interim = "", final = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const text = final || interim;
      transcriptRef.current = text;
      setTranscript(text);
    };

    recognition.onend = () => {
      const t = transcriptRef.current;
      if (t) processVoice(t);
      else setVoiceState("idle");
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech")
        setResponse("I didn't hear anything. Tap the mic and try again.");
      else if (event.error === "not-allowed")
        setResponse("Microphone access is needed. Please allow it in your browser settings.");
      else
        setResponse("Something went wrong. Try tapping the mic again.");
      setVoiceState("idle");
      clearResponseAfterDelay();
    };

    recognition.start();
  };

  const stopListening  = () => { if (recognitionRef.current) recognitionRef.current.stop(); };
  const handleMicClick = () => {
    if (voiceState === "listening") stopListening();
    else if (voiceState === "idle") startListening();
  };

  const micBg =
    voiceState === "listening"   ? "#e85d5d" :
    voiceState === "processing"  ? "rgba(200,160,100,0.25)" :
    "linear-gradient(135deg, #FAC775, #EF9F27)";

  const micShadow =
    voiceState === "listening"   ? "0 0 0 8px rgba(232,93,93,0.15), 0 8px 28px rgba(232,93,93,0.3)" :
    voiceState === "processing"  ? "none" :
    "0 8px 28px rgba(186,117,23,0.38), 0 2px 8px rgba(186,117,23,0.2)";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: NAV_CSS }} />

      {/* ── Response bubble ─────────────────────────────────────── */}
      {(response || (voiceState === "listening" && transcript)) && (
        <div style={{
          position: "fixed",
          bottom: 160,
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 56px)",
          maxWidth: 374,
          background: "rgba(254,250,244,0.96)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(200,160,100,0.15)",
          borderRadius: 20,
          padding: "16px 20px",
          boxShadow: "0 12px 40px rgba(60,40,20,0.1)",
          zIndex: 300,
          animation: "slideUp 0.3s ease both",
        }}>
          {voiceState === "listening" && transcript && (
            <p style={{
              fontSize: 15,
              color: "rgba(60,40,20,0.5)",
              fontStyle: "italic",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              lineHeight: 1.5,
              margin: 0,
            }}>
              &ldquo;{transcript}&rdquo;
            </p>
          )}
          {response && (
            <p style={{
              fontSize: 16,
              color: "#2a1a08",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontWeight: 400,
              lineHeight: 1.5,
              margin: 0,
            }}>
              {response}
            </p>
          )}
        </div>
      )}

      {/* ── Nav bar ─────────────────────────────────────────────── */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "center",
        paddingBottom: 20,
        paddingLeft: 24,
        paddingRight: 24,
        pointerEvents: "none",
      }}>
        <nav style={{
          position: "relative",
          background: "var(--white)",
          borderRadius: 30,
          boxShadow: "0 4px 20px rgba(186,117,23,0.14), 0 2px 8px rgba(186,117,23,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "8px",
          pointerEvents: "auto",
          overflow: "visible",
        }}>

          {/* Left tabs */}
          {LEFT_TABS.map((tab) => {
            const active = pathname === tab.href;
            const Icon   = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 76,
                  minHeight: 50,
                  borderRadius: 50,
                  textDecoration: "none",
                  gap: 3,
                  padding: "10px 14px",
                }}
              >
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 50,
                      background: "var(--primary)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <div style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}>
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.2 : 1.7}
                    color={active ? "var(--white)" : "var(--text-secondary)"}
                  />
                  <span style={{
                    fontSize: 10,
                    fontWeight: active ? 600 : 400,
                    color: active ? "var(--white)" : "var(--text-secondary)",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    lineHeight: 1,
                    letterSpacing: "0.01em",
                  }}>
                    {tab.label}
                  </span>
                </div>
              </Link>
            );
          })}

          {/* Center spacer — mic button floats above this */}
          <div style={{ width: 76, flexShrink: 0 }} />

          {/* Right tabs */}
          {RIGHT_TABS.map((tab) => {
            const active = pathname === tab.href;
            const Icon   = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 76,
                  minHeight: 50,
                  borderRadius: 50,
                  textDecoration: "none",
                  gap: 3,
                  padding: "10px 14px",
                }}
              >
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 50,
                      background: "var(--primary)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <div style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}>
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.2 : 1.7}
                    color={active ? "var(--white)" : "var(--text-secondary)"}
                  />
                  <span style={{
                    fontSize: 10,
                    fontWeight: active ? 600 : 400,
                    color: active ? "var(--white)" : "var(--text-secondary)",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    lineHeight: 1,
                    letterSpacing: "0.01em",
                  }}>
                    {tab.label}
                  </span>
                </div>
              </Link>
            );
          })}

          {/* ── Center raised mic button ─────────────────────────── */}
          <button
            onClick={handleMicClick}
            disabled={voiceState === "processing"}
            style={{
              position: "absolute",
              top: -22,
              left: "50%",
              transform: "translateX(-50%)",
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "3px solid white",
              cursor: voiceState === "processing" ? "wait" : "pointer",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: micBg,
              boxShadow: micShadow,
              transition: "background 0.2s, box-shadow 0.2s",
              animation: voiceState === "listening" ? "micPulse 1.5s ease-in-out infinite" : "none",
            }}
          >
            {voiceState === "processing" ? (
              <div style={{
                width: 20,
                height: 20,
                border: "2px solid rgba(186,117,23,0.3)",
                borderTopColor: "#BA7517",
                borderRadius: "50%",
                animation: "navSpin 0.8s linear infinite",
              }} />
            ) : (
              <svg
                width="22" height="22" viewBox="0 0 24 24"
                fill="none" stroke="white" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8"  y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

        </nav>
      </div>
    </>
  );
}
