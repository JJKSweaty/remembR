"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { speak, preloadVoices } from "@/lib/speech";

type ListeningState = "idle" | "listening" | "processing";

export default function VoiceButton() {
  const [state, setState] = useState<ListeningState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    preloadVoices();
  }, []);

  const startListening = () => {
    // Check browser support
    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setResponse("Voice input isn't supported in this browser. Try Safari or Chrome.");
      clearResponseAfterDelay();
      return;
    }

    setState("listening");
    setTranscript("");
    transcriptRef.current = "";
    setResponse(null);

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      const text = final || interim;
      transcriptRef.current = text;
      setTranscript(text);
    };

    recognition.onend = () => {
      const currentTranscript = transcriptRef.current;
      if (currentTranscript) {
        processVoice(currentTranscript);
      } else {
        setState("idle");
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "no-speech") {
        setResponse("I didn't hear anything. Tap the mic and try again.");
      } else if (event.error === "not-allowed") {
        setResponse("Microphone access is needed. Please allow it in your browser settings.");
      } else {
        setResponse("Something went wrong. Try tapping the mic again.");
      }
      setState("idle");
      clearResponseAfterDelay();
    };

    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      // onend will fire and handle processing via transcriptRef
    }
  };

  const processVoice = async (text: string) => {
    if (!text.trim()) {
      setState("idle");
      return;
    }

    setState("processing");
    setResponse(null);

    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });

      const data = await res.json();

      if (data._debug) {
        console.error("[voice _debug]", data._debug);
        setResponse("Error: " + data._debug);
        clearResponseAfterDelay(12000);
        setState("idle");
        return;
      }

      if (data.spokenResponse) {
        setResponse(data.spokenResponse);
        speak(data.spokenResponse);
        clearResponseAfterDelay(8000);
      }

      setState("idle");
    } catch (err) {
      console.error("Voice processing error:", err);
      const fallback = "I'm sorry, I couldn't process that right now. Try again in a moment.";
      setResponse(fallback);
      speak(fallback);
      setState("idle");
      clearResponseAfterDelay();
    }
  };

  const clearResponseAfterDelay = (ms = 5000) => {
    if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    responseTimerRef.current = setTimeout(() => {
      setResponse(null);
      setTranscript("");
    }, ms);
  };

  const handleClick = () => {
    if (state === "listening") {
      stopListening();
    } else if (state === "idle") {
      startListening();
    }
    // If processing, ignore taps
  };

  return (
    <>
      {/* Response bubble */}
      {(response || (state === "listening" && transcript)) && (
        <div
          style={{
            position: "fixed",
            bottom: 156,
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
          }}
        >
          {state === "listening" && transcript && (
            <p
              style={{
                fontSize: 15,
                color: "rgba(60,40,20,0.5)",
                fontStyle: "italic",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              &ldquo;{transcript}&rdquo;
            </p>
          )}
          {response && (
            <>
              <p
                style={{
                  fontSize: 16,
                  color: "#2a1a08",
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  fontWeight: 400,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {response}
              </p>
              <Link
                href="/chat"
                style={{
                  display: "block",
                  marginTop: 10,
                  fontSize: 12,
                  color: "#c87840",
                  textDecoration: "none",
                  textAlign: "right",
                  opacity: 0.7,
                }}
              >
                See all →
              </Link>
            </>
          )}
        </div>
      )}

      {/* Mic button */}
      <button
        onClick={handleClick}
        disabled={state === "processing"}
        style={{
          position: "fixed",
          bottom: 88,
          left: "50%",
          transform: "translateX(-50%)",
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          cursor: state === "processing" ? "wait" : "pointer",
          zIndex: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            state === "listening"
              ? "#e85d5d"
              : state === "processing"
              ? "rgba(200,160,100,0.25)"
              : "linear-gradient(135deg, #f5c084, #c87840)",
          boxShadow:
            state === "listening"
              ? "0 0 0 8px rgba(232,93,93,0.15), 0 8px 28px rgba(232,93,93,0.3)"
              : state === "processing"
              ? "none"
              : "0 8px 28px rgba(200,120,64,0.35)",
          transition: "all 0.2s",
          animation: state === "listening" ? "micPulse 1.5s ease-in-out infinite" : "none",
        }}
      >
        {state === "processing" ? (
          // Spinner
          <div
            style={{
              width: 20,
              height: 20,
              border: "2px solid rgba(200,120,64,0.3)",
              borderTopColor: "#c87840",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        ) : (
          // Mic icon
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes micPulse {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.08); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
