"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Mic } from "lucide-react";
import GoldenOrb from "@/components/GoldenOrb";
import PageWrapper from "@/components/PageWrapper";
import { speak, preloadVoices } from "@/lib/speech";
import type { OrbIntensity } from "@/components/GoldenOrb";

interface Message {
  id: string;
  role: "user" | "ember";
  text: string;
  time: string;
}

export default function Chat() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages]   = useState<Message[]>([]);
  const [loading, setLoading]     = useState(true);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [listening, setListening] = useState(false);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [wakeTriggered, setWakeTriggered] = useState(false);
  const [pendingMed, setPendingMed] = useState<{ name: string; dosage: string; time: string; frequency: string[]; messageId: string } | null>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef  = useRef("");
  const wakeRef        = useRef<any>(null);
  const wakeActiveRef  = useRef(false);

  useEffect(() => {
    preloadVoices();
    fetch("/api/voice-history")
      .then((r) => r.json())
      .then(({ history }) => {
        const msgs: Message[] = [];
        // history arrives newest-first; reverse so oldest shows at top
        for (const e of [...(history || [])].reverse()) {
          if (!e.transcript) continue; // skip orphaned ember responses
          msgs.push({ id: `u-${e.id}`, role: "user",  text: e.transcript, time: e.created_at });
          msgs.push({ id: `e-${e.id}`, role: "ember", text: e.response,   time: e.created_at });
        }
        setMessages(msgs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Auto-send message from nav mic (via query param)
  useEffect(() => {
    const msg = searchParams.get("msg");
    if (msg && !loading) {
      router.replace("/chat");
      sendMessage(msg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Auto-send message from nav mic (when already on chat page)
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (text) sendMessage(text);
    };
    window.addEventListener("ember-nav-mic", handler);
    return () => window.removeEventListener("ember-nav-mic", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      time: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res  = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: trimmed }),
      });
      const data = await res.json();
      const reply = data.spokenResponse || "I'm sorry, I couldn't respond right now.";
      const msgId = `e-${Date.now()}`;

      setMessages((prev) => [...prev, {
        id: msgId, role: "ember", text: reply, time: new Date().toISOString(),
      }]);
      speak(reply);

      // Handle medication add proposal
      if (data.action === "add_medication" && data.medication) {
        setPendingMed({ ...data.medication, messageId: msgId });
      } else {
        setPendingMed(null);
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: `e-err-${Date.now()}`,
        role: "ember",
        text: "I'm having trouble right now. Please try again in a moment.",
        time: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setInput("Voice input isn't supported in this browser.");
      return;
    }

    setListening(true);
    transcriptRef.current = "";

    const recognition = new SpeechRecognition();
    recognition.lang           = "en-US";
    recognition.interimResults = true;
    recognition.continuous     = false;
    recognitionRef.current     = recognition;

    recognition.onresult = (event: any) => {
      let interim = "", final = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const raw = final || interim;
      const text = raw.replace(/\bamber\b/gi, "Ember");
      transcriptRef.current = text;
      setInput(text);
    };

    recognition.onend = () => {
      setListening(false);
      if (transcriptRef.current.trim()) {
        sendMessage(transcriptRef.current);
      }
    };

    recognition.onerror = () => setListening(false);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const startWakeWord = () => {
    const SR = typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) return;

    wakeActiveRef.current = true;
    setWakeEnabled(true);

    const loop = () => {
      if (!wakeActiveRef.current) return;
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = false;
      wakeRef.current = rec;

      rec.onresult = (event: any) => {
        const raw = event.results[0][0].transcript;
        const text = raw.replace(/\bamber\b/gi, "Ember");
        const match = text.match(/hey\s+ember[,.]?\s*(.*)/i);
        if (match) {
          setWakeTriggered(true);
          const cmd = match[1].trim();
          if (cmd) {
            sendMessage(cmd);
          } else {
            startListening();
          }
          setTimeout(() => setWakeTriggered(false), 2000);
        }
      };

      rec.onend = () => {
        if (wakeActiveRef.current) setTimeout(loop, 200);
      };

      try { rec.start(); } catch {}
    };

    loop();
  };

  const stopWakeWord = () => {
    wakeActiveRef.current = false;
    setWakeEnabled(false);
    setWakeTriggered(false);
    wakeRef.current?.stop();
  };

  const confirmMed = async () => {
    if (!pendingMed) return;
    const med = pendingMed;
    setPendingMed(null);
    try {
      await fetch("/api/medications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: med.name, dosage: med.dosage, schedule: med.time }),
      });
      const reply = `Done! I've added ${med.name} to your medications.`;
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "ember", text: reply, time: new Date().toISOString() }]);
      speak(reply);
    } catch {
      const reply = "I had trouble saving that. Please try adding it manually.";
      setMessages((prev) => [...prev, { id: `e-err-${Date.now()}`, role: "ember", text: reply, time: new Date().toISOString() }]);
    }
  };

  const cancelMed = () => {
    setPendingMed(null);
    const reply = "No problem, just let me know if you change your mind.";
    setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "ember", text: reply, time: new Date().toISOString() }]);
    speak(reply);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const orbIntensity: OrbIntensity = sending ? "high" : (listening || wakeTriggered) ? "medium" : "low";

  return (
    <PageWrapper>

      {/* ── Sticky orb hero header ────────────────────────────────────── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--background)",
        paddingBottom: 12,
      }}>
        {/* Back button */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "center" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(239,159,39,0.08)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} color="#EF9F27" strokeWidth={2} />
          </button>
        </div>

        {/* Orb only — no title above */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
          <div style={{
            position: "absolute",
            top: -10, left: "50%",
            transform: "translateX(-50%)",
            width: 260, height: 160,
            background: sending
              ? "radial-gradient(ellipse at 50% 42%, rgba(239,159,39,0.28) 0%, rgba(239,159,39,0.08) 50%, transparent 70%)"
              : "radial-gradient(ellipse at 50% 42%, rgba(239,159,39,0.10) 0%, transparent 70%)",
            pointerEvents: "none",
            transition: "background 1.2s ease",
          }} />
          <motion.div
            animate={{ scale: sending ? 1.05 : 1 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <GoldenOrb size={80} intensity={orbIntensity} />
          </motion.div>
        </div>

        {/* Divider fade */}
        <div style={{
          height: 1,
          marginTop: 12,
          background: "linear-gradient(90deg, transparent, rgba(239,159,39,0.12), transparent)",
        }} />
      </div>

      {/* ── Messages ──────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 18px 172px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Loading skeletons */}
        {loading && (
          <>
            {[75, 110, 55, 95].map((w, i) => (
              <div key={i} style={{
                alignSelf: i % 2 === 0 ? "flex-end" : "flex-start",
                height: 46, width: `${w}%`, maxWidth: 260,
                borderRadius: 20,
                background: "rgba(239,159,39,0.06)",
                animation: "shimmer 1.6s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }} />
            ))}
          </>
        )}

        {/* Empty state */}
        {!loading && messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{ textAlign: "center", padding: "28px 24px 0" }}
          >
            <p style={{
              fontSize: 28, fontStyle: "italic", fontWeight: 400,
              color: "var(--text-primary)",
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              marginBottom: 8, lineHeight: 1.2,
            }}>
              Hello, I&apos;m Ember
            </p>
            <p style={{
              fontSize: 13, color: "var(--text-muted)",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              lineHeight: 1.6,
              marginBottom: 28,
            }}>
              Type a message or tap the mic
            </p>

            {/* Prompt chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {["How are my meds today?", "What time is it?", "I need help", "Tell me something nice"].map((prompt) => (
                <motion.button
                  key={prompt}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    background: "var(--card)",
                    border: "1px solid rgba(239,159,39,0.3)",
                    borderRadius: 30,
                    padding: "9px 16px",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  {prompt}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Message bubbles */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              style={{
                display: "flex",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 10,
                maxWidth: "82%",
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {/* Ember avatar — mini orb */}
              {msg.role === "ember" && (
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 35%, #FFFEF0, #FAC775 40%, #EF9F27 75%, #BA7517)",
                  flexShrink: 0,
                  boxShadow: "0 2px 10px rgba(239,159,39,0.4)",
                }} />
              )}

              <div>
                <div style={{
                  background: msg.role === "user" ? "#EF9F27" : "var(--card)",
                  border: msg.role === "user"
                    ? "none"
                    : "1px solid rgba(239,159,39,0.12)",
                  borderRadius: msg.role === "user"
                    ? "20px 20px 4px 20px"
                    : "20px 20px 20px 4px",
                  padding: "13px 17px",
                  boxShadow: msg.role === "ember"
                    ? "0 2px 12px rgba(0,0,0,0.15)"
                    : "none",
                }}>
                  <p
                    spellCheck={false}
                    style={{
                      fontSize: msg.role === "ember" ? 17 : 15,
                      color: msg.role === "user" ? "#FFFFFF" : "var(--text-primary)",
                      fontFamily: msg.role === "ember"
                        ? "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif"
                        : "var(--font-dm-sans), 'DM Sans', sans-serif",
                      lineHeight: msg.role === "ember" ? 1.6 : 1.5,
                      margin: 0,
                    }}
                  >
                    {msg.text}
                  </p>
                </div>
                <p style={{
                  fontSize: 10, color: "var(--text-muted)",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                  marginTop: 5,
                  textAlign: msg.role === "user" ? "right" : "left",
                  paddingLeft: msg.role === "ember" ? 5 : 0,
                  paddingRight: msg.role === "user" ? 5 : 0,
                }}>
                  {formatTime(msg.time)}
                </p>

                {/* Medication confirmation buttons */}
                {pendingMed?.messageId === msg.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ display: "flex", gap: 8, marginTop: 10 }}
                  >
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={confirmMed}
                      style={{
                        flex: 1, padding: "10px 16px",
                        background: "#EF9F27", color: "#0F0E09", border: "none",
                        borderRadius: 30, fontSize: 13, fontWeight: 600,
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        cursor: "pointer", boxShadow: "0 2px 10px rgba(239,159,39,0.3)",
                      }}
                    >
                      Yes, save it
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={cancelMed}
                      style={{
                        flex: 1, padding: "10px 16px",
                        background: "transparent", color: "var(--text-secondary)",
                        border: "1px solid rgba(239,159,39,0.3)",
                        borderRadius: 30, fontSize: 13, fontWeight: 500,
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      No thanks
                    </motion.button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {sending && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              style={{ display: "flex", alignItems: "flex-end", gap: 10, alignSelf: "flex-start" }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #FFFEF0, #FAC775 40%, #EF9F27 75%, #BA7517)",
                flexShrink: 0,
                boxShadow: "0 2px 10px rgba(239,159,39,0.4)",
              }} />
              <div style={{
                background: "var(--card)",
                border: "1px solid rgba(239,159,39,0.12)",
                borderRadius: "22px 22px 22px 5px",
                padding: "15px 20px",
                display: "flex", gap: 6, alignItems: "center",
                boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
              }}>
                {[0, 0.18, 0.36].map((delay) => (
                  <motion.div
                    key={delay}
                    animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay }}
                    style={{ width: 7, height: 7, borderRadius: "50%", background: "#EF9F27" }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar — fixed above nav ───────────────────────────────── */}
      <div style={{
        position: "fixed",
        bottom: 96,
        left: 0, right: 0,
        padding: "0 16px",
        zIndex: 40,
      }}>
        {/* Listening wave indicator */}
        <AnimatePresence>
          {listening && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              style={{
                textAlign: "center",
                marginBottom: 8,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {[0, 0.1, 0.2, 0.1, 0].map((delay, i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: [0.4, 1.2, 0.4] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay }}
                  style={{
                    width: 3, height: 16, borderRadius: 3,
                    background: "#FAC775",
                    transformOrigin: "center",
                  }}
                />
              ))}
              <span style={{
                fontSize: 12, color: "#FAC775",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                letterSpacing: "0.08em",
                marginLeft: 4,
              }}>
                Listening
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wake word toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, gap: 8 }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={wakeEnabled ? stopWakeWord : startWakeWord}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: wakeEnabled ? "rgba(239,159,39,0.12)" : "transparent",
              border: `1px solid ${wakeEnabled ? "rgba(239,159,39,0.4)" : "rgba(239,159,39,0.15)"}`,
              borderRadius: 30,
              padding: "6px 14px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <motion.div
              animate={wakeEnabled ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
              transition={{ duration: 1.5, repeat: wakeEnabled ? Infinity : 0 }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: wakeEnabled ? "#EF9F27" : "var(--text-muted)", flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: wakeEnabled ? "#EF9F27" : "var(--text-muted)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
              {wakeTriggered ? "Hey Ember!" : wakeEnabled ? "Say 'Hey Ember'" : "Wake word off"}
            </span>
          </motion.button>
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--surface)",
          border: `1px solid ${listening ? "rgba(250,199,117,0.4)" : wakeEnabled ? "rgba(239,159,39,0.3)" : "rgba(239,159,39,0.2)"}`,
          borderRadius: 50,
          padding: "8px 8px 8px 20px",
          boxShadow: sending
            ? "0 4px 28px rgba(239,159,39,0.2)"
            : "0 4px 24px rgba(0,0,0,0.5)",
          transition: "border-color 0.3s, box-shadow 0.3s",
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder={listening ? "Listening…" : wakeEnabled ? "Say 'Hey Ember…'" : "Message Ember…"}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 15,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              caretColor: "#EF9F27",
            }}
          />

          {/* Mic button */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            animate={listening ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={listening ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
            onClick={listening ? stopListening : startListening}
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "#EF9F27",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
              boxShadow: listening
                ? "0 0 0 6px rgba(239,159,39,0.2), 0 4px 16px rgba(239,159,39,0.5)"
                : "0 4px 16px rgba(239,159,39,0.4)",
              transition: "box-shadow 0.3s",
            }}
          >
            <Mic size={18} color="white" strokeWidth={2} />
          </motion.button>

          {/* Send button */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: input.trim() && !sending
                ? "radial-gradient(circle at 35% 35%, #FAD070, #EF9F27)"
                : "rgba(239,159,39,0.1)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: input.trim() && !sending ? "pointer" : "default",
              flexShrink: 0,
              boxShadow: input.trim() && !sending ? "0 2px 12px rgba(239,159,39,0.4)" : "none",
              transition: "all 0.2s",
            }}
          >
            <Send size={15} color={input.trim() && !sending ? "#0F0E09" : "#4A4232"} strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>
    </PageWrapper>
  );
}
