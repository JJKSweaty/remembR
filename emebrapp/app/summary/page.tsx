"use client";

import { useState } from "react";
import Orb from "@/components/Orb";
import PageWrapper from "@/components/PageWrapper";
import { getFullContext } from "@/lib/memory";

type OrbMood = "idle" | "scanning" | "happy";

export default function Summary() {
  const [report, setReport] = useState<string | null>(null);
  const [orbMood, setOrbMood] = useState<OrbMood>("idle");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setOrbMood("scanning");
    setReport(null);

    const context = getFullContext();

    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const data = await res.json() as { summary: string };
      setReport(data.summary);
      setOrbMood("happy");
      setTimeout(() => setOrbMood("idle"), 3000);
    } catch {
      setReport("Unable to generate a report right now. Please try again shortly.");
      setOrbMood("idle");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <PageWrapper>
      <div style={{ padding: "0 28px 120px", animation: "fadeUp 0.35s ease both" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, color: "rgba(60,40,20,0.35)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>Caregiver</p>
          <h2 style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, color: "#2a1a08", letterSpacing: "-0.3px", lineHeight: 1.1 }}>
            Daily<br /><em style={{ color: "#c87840" }}>report</em>
          </h2>
          <p style={{ fontSize: 12, color: "rgba(60,40,20,0.35)", marginTop: 8 }}>{today}</p>
        </div>

        {/* Orb */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <Orb mood={orbMood} size={110} />
        </div>

        {/* Generate button */}
        {!report && (
          <button
            onClick={generate}
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "rgba(200,160,100,0.15)" : "linear-gradient(135deg, #f5c084, #c87840)",
              color: loading ? "rgba(60,40,20,0.3)" : "white",
              border: "none",
              borderRadius: 18,
              padding: "22px",
              fontSize: 18,
              fontWeight: 300,
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 8px 32px rgba(200,120,64,0.25)",
              transition: "all 0.2s",
              letterSpacing: "0.02em",
              animation: "fadeUp 0.5s ease 0.1s both",
            }}
          >
            {loading ? "Generating report…" : "Generate today's report"}
          </button>
        )}

        {/* Report card */}
        {report && (
          <div style={{ animation: "slideUp 0.5s ease both" }}>
            <div style={{
              background: "rgba(255,248,236,0.85)",
              border: "1px solid rgba(200,160,100,0.18)",
              borderRadius: 22,
              padding: "28px 26px",
              marginBottom: 14,
              boxShadow: "0 4px 32px rgba(120,80,40,0.08)",
            }}>
              <p style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: 20,
                fontWeight: 300,
                color: "#2a1a08",
                lineHeight: 1.75,
              }}>
                {report}
              </p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={copyToClipboard}
                style={{
                  flex: 2,
                  background: copied ? "#a8c8a0" : "linear-gradient(135deg, #f5c084, #c87840)",
                  color: "white",
                  border: "none",
                  borderRadius: 16,
                  padding: "16px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow: copied ? "none" : "0 6px 24px rgba(200,120,64,0.28)",
                  transition: "all 0.25s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy for caregiver
                  </>
                )}
              </button>

              <button
                onClick={() => { setReport(null); setOrbMood("idle"); }}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "rgba(60,40,20,0.45)",
                  border: "1px solid rgba(200,160,100,0.2)",
                  borderRadius: 16,
                  padding: "16px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
