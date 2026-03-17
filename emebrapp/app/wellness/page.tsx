"use client";

import { useState, useEffect } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import { getUserName, logMood, getWellnessNotes } from "@/lib/memory";
import { speak, preloadVoices } from "@/lib/speech";

const moods = [
  { id: "happy", label: "Happy", icon: "✨", color: "#f5c084" },
  { id: "calm", label: "Calm", icon: "🌿", color: "#a8c8a0" },
  { id: "tired", label: "Tired", icon: "🌙", color: "#d8c8b0" },
  { id: "anxious", label: "Worried", icon: "🙏", color: "#c8a0a0" },
  { id: "sad", label: "Sad", icon: "💧", color: "#a0b0c8" },
] as const;

export default function WellnessPage() {
  const [userName, setUserName] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [showBreathing, setShowBreathing] = useState(false);
  const [breathCount, setBreathCount] = useState(0);
  const [notes, setNotes] = useState<{ author: string; content: string }[]>([]);

  useEffect(() => {
    preloadVoices();
    setUserName(getUserName());
    setNotes(getWellnessNotes());
  }, []);

  const handleMoodSelect = (moodId: typeof moods[number]["id"]) => {
    setSelectedMood(moodId);
    logMood(moodId);
    const moodLabel = moods.find(m => m.id === moodId)?.label;
    speak(`I've noted that you're feeling ${moodLabel}. Thank you for sharing that with me.`);
  };

  return (
    <PageWrapper>
      <div style={{ padding: "0 24px 120px", animation: "fadeUp 0.35s ease both" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ 
            fontSize: 11, 
            color: "rgba(60,40,20,0.35)", 
            letterSpacing: "0.16em", 
            textTransform: "uppercase", 
            marginBottom: 8 
          }}>Wellbeing</p>
          <h2 style={{ 
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", 
            fontSize: 40, 
            fontWeight: 300, 
            color: "#2a1a08", 
            letterSpacing: "-0.3px", 
            lineHeight: 1.1 
          }}>
            How are you,<br /><em style={{ color: "#c87840" }}>{userName || "there"}?</em>
          </h2>
        </div>

        {/* Mood Check-in */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(5, 1fr)", 
          gap: 10, 
          marginBottom: 40,
          animation: "fadeUp 0.5s ease 0.1s both"
        }}>
          {moods.map((m) => (
            <button
              key={m.id}
              onClick={() => handleMoodSelect(m.id)}
              style={{
                background: selectedMood === m.id ? m.color : "rgba(255,255,255,0.6)",
                border: "1px solid rgba(200,160,100,0.12)",
                borderRadius: 16,
                padding: "16px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: selectedMood === m.id ? `0 8px 20px ${m.color}44` : "none",
                transform: selectedMood === m.id ? "scale(1.05)" : "none"
              }}
            >
              <span style={{ fontSize: 24 }}>{m.icon}</span>
              <span style={{ 
                fontSize: 10, 
                fontWeight: 600, 
                color: selectedMood === m.id ? "white" : "rgba(60,40,20,0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.02em"
              }}>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Family Notes / Comfort */}
        <div style={{ 
          marginBottom: 40,
          animation: "fadeUp 0.5s ease 0.2s both"
        }}>
          <h3 style={{ 
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: 24,
            fontWeight: 300,
            color: "#2a1a08",
            marginBottom: 16
          }}>{(notes?.length || 0) > 1 ? "Notes from home" : "A note from home"}</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(notes || []).map((note, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.7)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(200,160,100,0.12)",
                borderRadius: 24,
                padding: "24px",
                boxShadow: "0 10px 40px rgba(120,80,40,0.05)",
                position: "relative",
                overflow: "hidden",
                animation: `fadeUp 0.5s ease ${0.2 + i * 0.1}s both`
              }}>
                <div style={{
                  position: "absolute",
                  top: -20,
                  right: -20,
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(245,192,132,0.15) 0%, transparent 70%)",
                }} />

                <p style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                  fontSize: 20,
                  fontStyle: "italic",
                  color: "#2a1a08",
                  margin: "0 0 12px",
                  lineHeight: 1.6
                }}>
                  "{note.content}"
                </p>
                <p style={{
                  fontSize: 12,
                  color: "#c87840",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  margin: 0
                }}>
                  — From {note.author}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Calming Tools Button */}
        <div style={{ animation: "fadeUp 0.5s ease 0.3s both" }}>
          {!showBreathing ? (
            <button
              onClick={() => setShowBreathing(true)}
              style={{
                width: "100%",
                background: "rgba(200,160,200,0.1)",
                border: "1px solid rgba(200,160,200,0.2)",
                borderRadius: 20,
                padding: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: "50%", 
                  background: "rgba(200,160,200,0.2)", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center" 
                }}>
                  <span style={{ fontSize: 20 }}>🌿</span>
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontSize: 15, fontWeight: 500, color: "#2a1a08", margin: 0 }}>Calming Tools</p>
                  <p style={{ fontSize: 12, color: "rgba(60,40,20,0.4)", margin: 0 }}>Breathing and focus exercises</p>
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(60,40,20,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <div style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(200,160,200,0.15)",
              borderRadius: 24,
              padding: "24px",
              animation: "fadeIn 0.5s ease both"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h4 style={{ margin: 0, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 20 }}>Breathe with Ember</h4>
                <button 
                  onClick={() => setShowBreathing(false)}
                  style={{ background: "none", border: "none", color: "#c87840", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                >
                  Close
                </button>
              </div>

               <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
                <button
                  onClick={() => setBreathCount((c) => c + 1)}
                  style={{
                    position: "relative",
                    width: 120,
                    height: 120,
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
                        inset: i * 14,
                        borderRadius: "50%",
                        background: i === 2 ? "rgba(180,140,200,0.2)" : `rgba(180,140,200,${0.05 + i * 0.02})`,
                        animation: `breatheRing ${4 + i}s ease-in-out ${i * 0.5}s infinite`,
                      }}
                    />
                  ))}
                  <span style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    color: "rgba(120,80,120,0.3)",
                    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                    fontStyle: "italic"
                  }}>
                    {breathCount || ""}
                  </span>
                </button>
              </div>

              <p style={{ textAlign: "center", fontSize: 13, color: "rgba(60,40,20,0.4)", margin: 0 }}>
                {breathCount === 0 ? "Breathe in as the circle grows..." : `${breathCount} breaths completed. Looking good.`}
              </p>
            </div>
          )}
        </div>

        {/* Status Check / Orientation moved to bottom or secondary */}
        <div style={{ 
          marginTop: 48, 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center",
          animation: "fadeIn 1s ease 0.5s both"
        }}>
          <Orb mood="calm" size={60} />
          <p style={{ 
            marginTop: 16,
            fontSize: 12, 
            color: "rgba(60,40,20,0.35)", 
            textAlign: "center",
            maxWidth: 240,
            lineHeight: 1.5
          }}>
            I'm here to support you. You're doing a great job today.
          </p>
        </div>
      </div>
    </PageWrapper>
  );
}
