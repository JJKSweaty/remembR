import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    // Fetch recent conversation history from Supabase
    const logs = await Promise.resolve(
      supabase
        .from("voice_history")
        .select("transcript, response")
        .order("created_at", { ascending: false })
        .limit(5)
    ).then(r => r.data).catch(() => null);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const systemPrompt = `
You are Ember, a warm and gentle AI companion for a person with dementia.
You keep your responses SHORT (1-3 sentences max), calm, and reassuring.
You speak like a caring friend, not a robot.

Current date and time: ${dateStr}, ${timeStr}

The patient's profile:
Name: Harris Thompson
Age: 78
Address: 142 Maple Street, Toronto, ON M5V 2H1
Emergency contact: Susan Thompson (daughter) — 416-555-0192

Harris's medication schedule:
- Donepezil (Aricept) 10mg — take 1 tablet every night at bedtime with water
- Lisinopril 5mg — take 1 tablet every morning with breakfast (for blood pressure)
- Metformin 500mg — take 1 tablet with breakfast AND 1 tablet with dinner (for diabetes)
- Vitamin D 1000 IU — take 1 capsule every morning with breakfast
- Aspirin 81mg — take 1 tablet every morning with breakfast (blood thinner)

Recent conversation history:
${JSON.stringify(logs || [])}

The user said: "${transcript}"

Determine the user's intent and respond accordingly:
- If they're asking about MEDICATIONS (what to take, when, etc), reference their medication list above.
- If they're telling you about a NEW medication, extract the name, dosage, and schedule.
- If they're asking WHAT TIME it is or WHAT DAY, tell them warmly.
- If they're asking WHERE something is, tell them to use the Find feature on their phone.
- If they seem CONFUSED or anxious, be extra reassuring and calm.
- If they're just chatting, respond warmly.

Return a STRICT JSON object in this exact format:
{
  "spokenResponse": "string — your warm, concise response to be spoken aloud",
  "intent": "string — one of: medication_info, add_medication, time_date, find_object, confused, general",
  "medicationName": "string or null — if adding a new medication",
  "medicationDose": "string or null — if adding a new medication", 
  "medicationSchedule": "string or null — if adding a new medication"
}
`;

    console.log("[voice] calling Gemini, key set:", !!process.env.GEMINI_API_KEY);
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        }),
      }
    );
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${errText}`);
    }
    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates[0].content.parts[0].text as string;
    console.log("[voice] Gemini raw response:", rawText.slice(0, 200));
    const responseText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(responseText);

    // Persist to Supabase — fire and forget, failures don't affect the response
    if (parsed.intent === "add_medication" && parsed.medicationName && parsed.medicationSchedule) {
      Promise.resolve(supabase.from("medications").select("id").eq("name", parsed.medicationName).limit(1))
        .then(async ({ data: existing }) => {
          if (!existing || existing.length === 0) {
            await supabase.from("medications").insert({ name: parsed.medicationName, schedule: parsed.medicationSchedule, taken_today: false });
          } else {
            await supabase.from("medications").update({ schedule: parsed.medicationSchedule }).eq("name", parsed.medicationName);
          }
          await supabase.from("medication_history").insert({ medication_name: parsed.medicationName, dosage: parsed.medicationDose || null, action: "added" });
          await supabase.from("memory_logs").insert({ event_type: "medication_added", description: `Voice: "${transcript}" → Added/updated ${parsed.medicationName} (${parsed.medicationSchedule})` });
        })
        .catch(() => {});
    }

    Promise.resolve(supabase.from("voice_history").insert({ transcript, response: parsed.spokenResponse, intent: parsed.intent })).catch(() => {});

    return NextResponse.json(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error in voice processing:", msg);
    return NextResponse.json(
      {
        spokenResponse: "I'm sorry, I had trouble understanding that. Could you try again?",
        intent: "error",
        _debug: msg,
      },
      { status: 200 }
    );
  }
}
