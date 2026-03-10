import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: medications, error } = await supabase
      .from("medications")
      .select("*")
      .order("schedule", { ascending: true });

    if (error) {
      console.error("Error fetching medications:", error);
      return NextResponse.json({ medications: [] });
    }

    return NextResponse.json({ medications: medications || [] });
  } catch (error) {
    console.error("Error in medications API:", error);
    return NextResponse.json({ medications: [] });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, taken_today } = await req.json();

    const { error } = await supabase
      .from("medications")
      .update({ taken_today })
      .eq("id", id);

    if (error) {
      console.error("Error updating medication:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // Log the event
    const { data: med } = await supabase
      .from("medications")
      .select("name")
      .eq("id", id)
      .single();

    if (med) {
      // Log to medication_history (permanent record)
      await supabase.from("medication_history").insert({
        medication_name: med.name,
        action: taken_today ? "taken" : "skipped",
      });

      await supabase.from("memory_logs").insert({
        event_type: "medication_taken",
        description: `${med.name} marked as ${taken_today ? "taken" : "not taken"}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in medications PATCH:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
