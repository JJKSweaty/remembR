import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { transcript, barcode } = await req.json();

    // Fetch the user's current medications and recent logs from Supabase
    const { data: medications, error: medError } = await supabase.from("medications").select("*");
    const { data: logs, error: logError } = await supabase
      .from("memory_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (medError) console.error("Medications fetch error:", medError);
    if (logError) console.error("Logs fetch error:", logError);

    // Mock barcode lookup
    let identifiedMeds = "";
    if (barcode) {
      identifiedMeds = "Donepezil";
    }

    const systemPrompt = `
      You are Ember, a helpful Voice-First AI assistant.
      The user is asking about or logging their medication.
      
      Here is the user's current medications from the database:
      ${JSON.stringify(medications || [])}
      
      Here are the user's recent memory logs:
      ${JSON.stringify(logs || [])}

      The user said: "${transcript}"
      ${barcode ? `The user scanned a barcode which was identified as: ${identifiedMeds}` : ""}

      Analyze the transcript and barcode data, determine the medication schedule and if it's taken.
      Return a STRICT JSON object in this exact format, with no markdown formatting:
      {
        "medicationName": "string (the name of the medication)",
        "schedule": "string (when they should take it)",
        "spokenResponse": "string (a friendly, concise response to be spoken aloud)"
      }
    `;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();

    const parsedData = JSON.parse(responseText);

    // Save the medication to Supabase so it's remembered
    if (parsedData.medicationName && parsedData.schedule) {
      // Check if this medication already exists
      const { data: existing } = await supabase
        .from("medications")
        .select("id")
        .eq("name", parsedData.medicationName)
        .limit(1);

      if (!existing || existing.length === 0) {
        // Insert new medication
        const { error: insertError } = await supabase.from("medications").insert({
          name: parsedData.medicationName,
          schedule: parsedData.schedule,
          taken_today: false,
        });
        if (insertError) console.error("Error saving medication:", insertError);
      } else {
        // Update existing medication schedule
        const { error: updateError } = await supabase
          .from("medications")
          .update({ schedule: parsedData.schedule })
          .eq("name", parsedData.medicationName);
        if (updateError) console.error("Error updating medication:", updateError);
      }

      // Log to memory_logs
      await supabase.from("memory_logs").insert({
        event_type: "medication_added",
        description: `Voice command: "${transcript}" → Added/updated ${parsedData.medicationName} (${parsedData.schedule})`,
      });
    }

    return NextResponse.json(parsedData);
  } catch (error) {
    console.error("Error in process-med-command:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
