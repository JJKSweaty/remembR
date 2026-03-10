import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

export async function POST(req: NextRequest) {
  try {
    const { context } = await req.json() as { context: string };

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });

    const prompt = `You are writing a daily caregiver report for the user's family and care team. Today is ${today}.

Here is what happened today:
${context}

Write a warm, readable paragraph summary of the user's day — the kind a caring nurse would write. Use the user's name if provided in the context. Mention medications taken or missed, any items they looked for, any moments of confusion and how they resolved, and their general wellbeing. Keep it to 3-5 sentences. Be warm and specific. Use plain language. Do not use bullet points.

Respond with only the paragraph, no heading, no quotes.`;

    // Try each model — fall back on rate-limit (429) errors
    let lastError: unknown = null;
    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return NextResponse.json({ summary: result.response.text().trim() });
      } catch (err) {
        lastError = err;
        const e = err as { status?: number };
        if (e.status === 429) {
          console.log(`Rate limited on ${modelName}, trying next...`);
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  } catch (err) {
    console.error("Summary error:", err);
    return NextResponse.json({
      summary: "It was a gentle day today. We were unable to generate a full report at this time — please check back shortly.",
    });
  }
}
