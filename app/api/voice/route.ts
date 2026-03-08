import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    // Fetch context from Supabase
    const { data: medications } = await supabase.from("medications").select("*");
    const { data: profile } = await supabase.from("patient_profile").select("*").limit(1).single();
    const { data: logs } = await supabase
      .from("voice_history")
      .select("transcript, response")
      .order("created_at", { ascending: false })
      .limit(5);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const systemPrompt = `
You are Ember, a warm and gentle AI companion for a person with dementia.
You keep your responses SHORT (1-3 sentences max), calm, and reassuring.
You speak like a caring friend, not a robot.

Current date and time: ${dateStr}, ${timeStr}

The user's profile:
Name: ${profile?.name || "unknown"}
Address: ${profile?.address || "unknown"}
Emergency contact: ${profile?.emergency_contact_name || "not set"} (${profile?.emergency_contact_phone || ""})

The user's medications from the database:
${JSON.stringify(medications || [])}

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

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    // If adding a new medication, persist to Supabase
    if (parsed.intent === "add_medication" && parsed.medicationName && parsed.medicationSchedule) {
      const { data: existing } = await supabase
        .from("medications")
        .select("id")
        .eq("name", parsed.medicationName)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("medications").insert({
          name: parsed.medicationName,
          schedule: parsed.medicationSchedule,
          taken_today: false,
        });
      } else {
        await supabase
          .from("medications")
          .update({ schedule: parsed.medicationSchedule })
          .eq("name", parsed.medicationName);
      }

      await supabase.from("medication_history").insert({
        medication_name: parsed.medicationName,
        dosage: parsed.medicationDose || null,
        action: "added",
      });

      await supabase.from("memory_logs").insert({
        event_type: "medication_added",
        description: `Voice: "${transcript}" → Added/updated ${parsed.medicationName} (${parsed.medicationSchedule})`,
      });
    }

    // Log to voice_history
    await supabase.from("voice_history").insert({
      transcript,
      response: parsed.spokenResponse,
      intent: parsed.intent,
    });

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
