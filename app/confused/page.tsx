"use client";

import { useState, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import { getUserProfile } from "@/lib/memory";
import { speak, stopSpeaking, preloadVoices } from "@/lib/speech";

type OrbMood = "calm" | "happy";

interface InfoCard {
  label: string;
  value: string;
  icon: string;
}

export default function HelpPage() {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [infoCards, setInfoCards] = useState<InfoCard[]>([]);
  const [breathCount, setBreathCount] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [nextTask, setNextTask] = useState<string | null>(null);

  useEffect(() => {
    preloadVoices();
    const profile = getUserProfile();
    const name = profile.name || "";
    const address = profile.address || "";
    setUserName(name);
    setUserAddress(address);

    const now = new Date();
    const cards: InfoCard[] = [];

    if (name) cards.push({ label: "Your name", value: name, icon: "👤" });
    cards.push({
      label: "Today is",
      value: now.toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      icon: "📅",
    });
    cards.push({
      label: "The time is",
      value: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      icon: "🕐",
    });
    if (address) cards.push({ label: "Your home address", value: address, icon: "🏠" });

    // Figure out what they should be doing now
    const h = now.getHours();
    if (h < 9) setNextTask("It's morning. Time for breakfast soon.");
    else if (h < 12) setNextTask("It's mid-morning. You're doing well.");
    else if (h < 14) setNextTask("It's around lunchtime.");
    else if (h < 17) setNextTask("It's the afternoon. Everything is fine.");
    else if (h < 19) setNextTask("It's evening. Dinner time is coming up.");
    else if (h < 21) setNextTask("It's the evening. Time to start winding down.");
    else setNextTask("It's nighttime. Time to rest soon.");

    // Check for upcoming medications
    const nowMins = h * 60 + now.getMinutes();
    const upcomingMed = profile.medications.find((med) => {
      const [timePart, period] = med.time.split(" ");
      const [mh, mm] = timePart.split(":").map(Number);
      let hour = mh;
      if (period === "PM" && mh !== 12) hour += 12;
      if (period === "AM" && mh === 12) hour = 0;
      const medMins = hour * 60 + mm;
      return medMins >= nowMins && medMins <= nowMins + 60;
    });
    if (upcomingMed) {
      cards.push({
        label: "Upcoming medicine",
        value: `${upcomingMed.name} (${upcomingMed.dose}) at ${upcomingMed.time}`,
        icon: "💊",
      });
    }

    setInfoCards(cards);
  }, []);

  const speakAll = () => {
    setIsSpeaking(true);

    const lines: string[] = [];
    if (userName) lines.push(`Your name is ${userName}.`);
    lines.push(
      `Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}.`
    );
    lines.push(
      `The time is ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`
    );
    if (userAddress) lines.push(`Your home address is ${userAddress}.`);
    if (nextTask) lines.push(nextTask);
    lines.push("You are safe. Everything is okay.");

    speak(lines.join(" "));
    // Auto-clear speaking state after estimated duration
    setTimeout(() => setIsSpeaking(false), lines.join(" ").length * 70);
  };

  const handleStopSpeaking = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  // Step 0: Calming / breathing
  // Step 1: "Where am I?" orientation
  // Step 2: Full info + actions
  // Step 3: Breathing exercise

  const orbMood: OrbMood = step >= 2 ? "happy" : "calm";

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>
        <div style={{ animation: "fadeUp 0.5s ease both", marginBottom: 28 }}>
          <p
            style={{
              fontSize: 11,
              color: "rgba(60,40,20,0.35)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            I&apos;m here for you
          </p>
          <h2
            key={step}
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 40,
              fontWeight: 300,
              color: "#2a1a08",
              letterSpacing: "-0.3px",
              lineHeight: 1.15,
              animation: "fadeUp 0.4s ease both",
            }}
          >
            {step === 0 && (
              <>
                It&apos;s okay{userName ? "," : "."}
                <br />
                {userName ? (
                  <em style={{ color: "#c87840" }}>{userName}.</em>
                ) : (
                  <em style={{ color: "#c87840" }}>You&apos;re safe.</em>
                )}
              </>
            )}
            {step === 1 && (
              <>
                Here&apos;s what
                <br />
                <em style={{ color: "#c87840" }}>you need to know.</em>
              </>
            )}
            {step === 2 && (
              <>
                You&apos;re doing
                <br />
                <em style={{ color: "#c87840" }}>great.</em>
              </>
            )}
            {step === 3 && (
              <>
                Breathe with
                <br />
                <em style={{ color: "#c87840" }}>me.</em>
              </>
            )}
          </h2>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <Orb mood={orbMood} size={110} />
        </div>

        {/* ── Step 0: Initial calming ── */}
        {step === 0 && (
          <div style={{ animation: "fadeUp 0.4s ease 0.1s both" }} key="step0">
            <p
              style={{
                fontSize: 20,
                color: "rgba(60,40,20,0.55)",
                fontWeight: 300,
                lineHeight: 1.65,
                marginBottom: 28,
                textAlign: "center",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontStyle: "italic",
                animation: "fadeIn 0.5s ease 0.1s both",
              }}
            >
              You&apos;re safe. Take a moment. I&apos;m right here with you.
            </p>

            {/* Quick help buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 18,
                  padding: "20px",
                  fontSize: 18,
                  fontWeight: 400,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  cursor: "pointer",
                  boxShadow: "0 8px 32px rgba(200,120,64,0.22)",
                }}
              >
                Where am I? What time is it?
              </button>

              <button
                onClick={() => setStep(3)}
                style={{
                  width: "100%",
                  background: "rgba(200,160,200,0.12)",
                  color: "rgba(60,40,20,0.6)",
                  border: "1px solid rgba(200,160,200,0.2)",
                  borderRadius: 18,
                  padding: "18px",
                  fontSize: 16,
                  fontWeight: 400,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  cursor: "pointer",
                }}
              >
                I need to calm down
              </button>

              <button
                onClick={speakAll}
                style={{
                  width: "100%",
                  background: "rgba(255,248,236,0.8)",
                  color: "rgba(60,40,20,0.55)",
                  border: "1px solid rgba(200,160,100,0.2)",
                  borderRadius: 18,
                  padding: "18px",
                  fontSize: 16,
                  fontWeight: 400,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>🔊</span>
                Read everything to me
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Orientation info cards ── */}
        {step === 1 && (
          <div style={{ animation: "fadeUp 0.4s ease 0.1s both" }} key="step1">
            {/* Info cards */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {infoCards.map((card, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,248,236,0.8)",
                    border: "1px solid rgba(200,160,100,0.15)",
                    borderRadius: 16,
                    padding: "16px 18px",
                    animation: `fadeUp 0.4s ease ${i * 0.08}s both`,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{card.icon}</span>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "rgba(60,40,20,0.35)",
                        marginBottom: 4,
                      }}
                    >
                      {card.label}
                    </div>
                    <div
                      style={{
                        fontFamily:
                          "var(--font-cormorant), 'Cormorant Garamond', serif",
                        fontSize: 22,
                        fontWeight: 400,
                        color: "#2a1a08",
                      }}
                    >
                      {card.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* "Right now" contextual message */}
            {nextTask && (
              <div
                style={{
                  background: "rgba(200,120,64,0.06)",
                  border: "1px solid rgba(200,120,64,0.12)",
                  borderRadius: 16,
                  padding: "16px 18px",
                  marginBottom: 20,
                  animation: "fadeUp 0.4s ease 0.3s both",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(200,120,64,0.6)",
                    marginBottom: 4,
                  }}
                >
                  Right now
                </div>
                <div
                  style={{
                    fontFamily:
                      "var(--font-cormorant), 'Cormorant Garamond', serif",
                    fontSize: 20,
                    fontWeight: 300,
                    color: "#2a1a08",
                    fontStyle: "italic",
                  }}
                >
                  {nextTask}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={speakAll}
                style={{
                  width: "100%",
                  background: isSpeaking
                    ? "#a8c8a0"
                    : "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 18,
                  padding: "18px",
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow: "0 6px 24px rgba(200,120,64,0.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all 0.25s",
                }}
              >
                {isSpeaking ? (
                  <>
                    <span onClick={(e) => { e.stopPropagation(); stopSpeaking(); }}>
                      🔊 Speaking...
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 16 }}>🔊</span>
                    Read this to me
                  </>
                )}
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setStep(3)}
                  style={{
                    flex: 1,
                    background: "rgba(200,160,200,0.12)",
                    color: "rgba(60,40,20,0.5)",
                    border: "1px solid rgba(200,160,200,0.2)",
                    borderRadius: 16,
                    padding: "16px",
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  }}
                >
                  Breathe
                </button>
                <button
                  onClick={() => setStep(0)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    color: "rgba(60,40,20,0.4)",
                    border: "1px solid rgba(200,160,100,0.2)",
                    borderRadius: 16,
                    padding: "16px",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Go back
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Encouragement (reached after breathing) ── */}
        {step === 2 && (
          <div style={{ animation: "fadeUp 0.4s ease 0.1s both" }} key="step2">
            <p
              style={{
                fontSize: 20,
                color: "rgba(60,40,20,0.55)",
                fontWeight: 300,
                lineHeight: 1.65,
                marginBottom: 28,
                textAlign: "center",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontStyle: "italic",
              }}
            >
              You did {breathCount} breath{breathCount !== 1 ? "s" : ""}. That was
              wonderful.
              <br />
              You&apos;re safe and everything is okay.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 18,
                  padding: "18px",
                  fontSize: 16,
                  fontWeight: 400,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  cursor: "pointer",
                  boxShadow: "0 8px 32px rgba(200,120,64,0.22)",
                }}
              >
                Show me my information
              </button>
              <button
                onClick={() => setStep(0)}
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "rgba(60,40,20,0.45)",
                  border: "1px solid rgba(200,160,100,0.2)",
                  borderRadius: 18,
                  padding: "18px",
                  fontSize: 16,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  cursor: "pointer",
                }}
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Guided breathing exercise ── */}
        {step === 3 && (
          <div style={{ animation: "fadeUp 0.4s ease 0.1s both" }} key="step3">
            <p
              style={{
                fontSize: 20,
                color: "rgba(60,40,20,0.55)",
                fontWeight: 300,
                lineHeight: 1.65,
                marginBottom: 8,
                textAlign: "center",
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontStyle: "italic",
              }}
            >
              Follow the circle. Breathe in as it grows, out as it shrinks.
            </p>

            {/* Breath counter */}
            <p
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "rgba(60,40,20,0.3)",
                marginBottom: 28,
              }}
            >
              {breathCount > 0
                ? `${breathCount} breath${breathCount !== 1 ? "s" : ""} completed`
                : "Tap the circle to count a breath"}
            </p>

            {/* Breathing circle */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 36,
              }}
            >
              <button
                onClick={() => setBreathCount((c) => c + 1)}
                style={{
                  position: "relative",
                  width: 140,
                  height: 140,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      inset: i * 16,
                      borderRadius: "50%",
                      background:
                        i === 2
                          ? "rgba(180,140,200,0.25)"
                          : `rgba(180,140,200,${0.06 + i * 0.02})`,
                      animation: `breatheRing ${4 + i}s ease-in-out ${i * 0.5}s infinite`,
                    }}
                  />
                ))}
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily:
                      "var(--font-cormorant), 'Cormorant Garamond', serif",
                    fontSize: 32,
                    color: "rgba(60,40,20,0.2)",
                    fontStyle: "italic",
                    animation: "breatheRing 4s ease-in-out infinite",
                  }}
                >
                  {breathCount || ""}
                </span>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 18,
                  padding: "18px",
                  fontSize: 16,
                  fontWeight: 400,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  cursor: "pointer",
                  boxShadow: "0 8px 32px rgba(200,120,64,0.22)",
                }}
              >
                I feel better now
              </button>
              <button
                onClick={() => setStep(0)}
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "rgba(60,40,20,0.45)",
                  border: "1px solid rgba(200,160,100,0.2)",
                  borderRadius: 18,
                  padding: "18px",
                  fontSize: 16,
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  cursor: "pointer",
                }}
              >
                Go back
              </button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
