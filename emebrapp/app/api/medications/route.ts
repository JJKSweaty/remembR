import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Module-level cache: midnight reset only needs one DB query per day per process
let lastResetDate = "";

export async function GET() {
  try {
    // Midnight reset — runs at most once per day per server process
    // Wrapped in try/catch so schema drift never blocks the main SELECT
    try {
      const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
      if (lastResetDate !== today) {
        const { data: stale } = await supabase
          .from("medications")
          .select("id")
          .or(`last_reset_date.is.null,last_reset_date.lt.${today}`)
          .limit(1);

        if (stale && stale.length > 0) {
          await supabase
            .from("medications")
            .update({ taken_today: false, taken_at: null, last_reset_date: today })
            .not("id", "is", null);
        }
        lastResetDate = today;
      }
    } catch (resetErr) {
      console.warn("Midnight reset skipped (columns may not exist yet):", resetErr);
    }

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

    // Try updating with taken_at first; fall back without it if column missing
    let updateError = (await supabase
      .from("medications")
      .update({ taken_today, taken_at: taken_today ? new Date().toISOString() : null })
      .eq("id", id)).error;

    if (updateError?.message?.includes("taken_at")) {
      const fallback = await supabase
        .from("medications")
        .update({ taken_today })
        .eq("id", id);
      updateError = fallback.error;
    }

    if (updateError) {
      console.error("Error updating medication:", updateError);
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
