"use client";

import { useState, useEffect } from "react";
import PageWrapper from "@/components/PageWrapper";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";

interface VoiceEntry {
  id: string;
  transcript: string;
  response: string;
  intent: string | null;
  created_at: string;
}

export default function Chat() {
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("voice_history")
      .select("id, transcript, response, intent, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries(data || []);
        setLoading(false);
      });
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px" }}>
        <PageHeader title="Conversations" />

        {loading && (
          <div style={{ textAlign: "center", paddingTop: 60, color: "rgba(60,40,20,0.3)", fontSize: 14 }}>
            Loading…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <p style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: 22,
              fontWeight: 300,
              color: "rgba(60,40,20,0.4)",
              fontStyle: "italic",
            }}>
              No conversations yet
            </p>
            <p style={{ fontSize: 13, color: "rgba(60,40,20,0.3)", marginTop: 8 }}>
              Tap the mic button to start talking with Ember
            </p>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  background: "rgba(255,248,236,0.7)",
                  border: "1px solid rgba(200,160,100,0.12)",
                  borderRadius: 20,
                  padding: "16px 18px",
                  animation: "fadeUp 0.3s ease both",
                }}
              >
                {/* User transcript */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: "rgba(200,160,100,0.15)",
                    flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11,
                  }}>
                    👤
                  </div>
                  <p style={{
                    fontSize: 14,
                    color: "rgba(60,40,20,0.7)",
                    lineHeight: 1.5,
                    margin: 0,
                    fontStyle: "italic",
                  }}>
                    &ldquo;{entry.transcript}&rdquo;
                  </p>
                </div>

                {/* Ember response */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: "linear-gradient(135deg, #f5c084, #c87840)",
                    flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11,
                  }}>
                    ✦
                  </div>
                  <p style={{
                    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                    fontSize: 16,
                    color: "#2a1a08",
                    lineHeight: 1.6,
                    margin: 0,
                    fontWeight: 400,
                  }}>
                    {entry.response}
                  </p>
                </div>

                {/* Timestamp */}
                <p style={{
                  fontSize: 11,
                  color: "rgba(60,40,20,0.3)",
                  marginTop: 12,
                  marginBottom: 0,
                  textAlign: "right",
                }}>
                  {formatTime(entry.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
