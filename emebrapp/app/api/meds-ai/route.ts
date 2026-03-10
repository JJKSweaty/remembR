import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

export async function POST(req: NextRequest) {
  try {
    const { meds, context } = await req.json() as {
      meds: { name: string; dose: string; time: string; taken: boolean }[];
      context?: string;
    };

    const taken = meds.filter(m => m.taken).map(m => `${m.name} ${m.dose} at ${m.time}`);
    const pending = meds.filter(m => !m.taken).map(m => `${m.name} ${m.dose} at ${m.time}`);

    const prompt = `You are Ember, a warm and gentle companion. Write a single short, warm, encouraging message about the user's medicines today. Speak directly to the user in a calm and friendly tone. Use their name if provided in the context. Keep it to 1-2 sentences.

Medicines taken today: ${taken.length > 0 ? taken.join(", ") : "none yet"}.
Medicines still to take: ${pending.length > 0 ? pending.join(", ") : "none — all done!"}.
${context ? `Context: ${context}` : ""}

Respond with only the message, no quotes, no extra text.`;

    // Try each model — fall back on rate-limit (429) errors
    let lastError: unknown = null;
    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return NextResponse.json({ message: result.response.text().trim() });
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
    console.error("Meds AI error:", err);
    return NextResponse.json({
      message: "Let's check your medicines for today.",
    });
  }
}
