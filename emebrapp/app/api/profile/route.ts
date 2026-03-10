import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET — fetch the patient profile (single row)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("patient_profile")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows — that's okay, profile hasn't been created yet
      console.error("Error fetching profile:", error);
    }

    return NextResponse.json({ profile: data || null });
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json({ profile: null });
  }
}

// PUT — create or update the patient profile
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { name, address, emergency_contact_name, emergency_contact_phone, date_of_birth, notes } = body;

    // Check if a profile exists
    const { data: existing } = await supabase
      .from("patient_profile")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      // Update existing profile
      const { error } = await supabase
        .from("patient_profile")
        .update({
          name,
          address,
          emergency_contact_name,
          emergency_contact_phone,
          date_of_birth,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        console.error("Error updating profile:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
      }
    } else {
      // Create new profile
      const { error } = await supabase.from("patient_profile").insert({
        name,
        address,
        emergency_contact_name,
        emergency_contact_phone,
        date_of_birth,
        notes,
      });

      if (error) {
        console.error("Error creating profile:", error);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }
    }

    // Log the update
    await supabase.from("memory_logs").insert({
      event_type: "profile_updated",
      description: `Patient profile updated: ${name || "unnamed"}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
