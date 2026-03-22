import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    // Fetch patient context and conversation history in parallel
    const [{ data: profile }, { data: medications }, { data: logs }] = await Promise.all([
      supabase.from("patient_profile").select("*").limit(1).single(),
      supabase.from("medications").select("name, dosage, schedule, taken_today").order("schedule", { ascending: true }),
      supabase.from("voice_history").select("transcript, response").order("created_at", { ascending: false }).limit(5),
    ]);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    let profileSection = "The patient's profile has not been set up yet.";
    if (profile) {
      const parts = [`Name: ${profile.name || "Unknown"}`];
      if (profile.date_of_birth) {
        const age = Math.floor((now.getTime() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        parts.push(`Age: ${age}`);
      }
      if (profile.address) parts.push(`Address: ${profile.address}`);
      if (profile.emergency_contact_name) {
        const ec = profile.emergency_contact_phone
          ? `${profile.emergency_contact_name} — ${profile.emergency_contact_phone}`
          : profile.emergency_contact_name;
        parts.push(`Emergency contact: ${ec}`);
      }
      if (profile.notes) parts.push(`Notes: ${profile.notes}`);
      profileSection = `The patient's profile:\n${parts.join("\n")}`;
    }

    // Use preferred name if noted in the notes field, otherwise fall back to first name
    const notesText = (profile?.notes as string) || "";
    const preferredMatch = notesText.match(/Preferred name:\s*([^.]+)/i);
    const firstName = preferredMatch?.[1]?.trim() || (profile?.name as string | null)?.split(" ")[0] || "The patient";
    const medsSection = medications && medications.length > 0
      ? `${firstName}'s medication schedule:\n${medications.map(m =>
          `- ${m.name}${m.dosage ? ` ${m.dosage}` : ""} — ${m.schedule}${m.taken_today ? " (already taken today)" : ""}`
        ).join("\n")}`
      : "No medications are currently on record.";

    const systemPrompt = `
You are Ember, a warm and gentle AI companion for a person with dementia.
You keep your responses SHORT (1-3 sentences max), calm, and reassuring.
You speak like a caring friend, not a robot.
Do NOT use pet names like "sweet friend" or "dear" in every message — use them very sparingly, only when the person seems upset or confused. Keep your tone natural and conversational.

IMPORTANT — medication confirmation flow:
- If the user says they want to CONFIRM adding a medication (e.g. "yes", "sure", "ok", "go ahead", "save it"), and the intent is "confirm_add_medication", respond warmly that you've saved it.
- If the user says NO to adding (e.g. "no", "never mind", "cancel"), set intent to "cancel_add_medication" and respond warmly.
- If the user wants to ADD a new medication (says something like "add X mg at Y time" or "I take X every morning"), extract the details and set intent to "add_medication". Include an "action" field and a "confirmationMessage" in your response asking them to confirm.
  The action structure must be:
  {
    "action": "add_medication",
    "medication": { "name": "...", "dosage": "...", "time": "HH:MM", "frequency": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] },
    "confirmationMessage": "I'll add [name] [dosage] at [time] every day. Should I save it?"
  }
  Set spokenResponse to the same as confirmationMessage.
  If no frequency specified, default to every day.

Current date and time: ${dateStr}, ${timeStr}

${profileSection}

${medsSection}

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
  "intent": "string — one of: medication_info, add_medication, confirm_add_medication, cancel_add_medication, time_date, find_object, confused, general",
  "action": "string or null — only 'add_medication' when proposing to add one",
  "medication": "object or null — { name, dosage, time, frequency } only when action is add_medication",
  "confirmationMessage": "string or null — confirmation prompt when action is add_medication",
  "medicationName": "string or null — legacy field for background save",
  "medicationDose": "string or null",
  "medicationSchedule": "string or null"
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
