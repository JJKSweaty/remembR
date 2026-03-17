import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  try {
    const today = new Date().toISOString().split("T")[0];

    const { error } = await supabase
      .from("medications")
      .update({ taken_today: false, taken_at: null, last_reset_date: today })
      .not("id", "is", null);

    if (error) {
      console.error("Error resetting medications:", error);
      return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
    }

    return NextResponse.json({ success: true, reset_date: today });
  } catch (error) {
    console.error("Error in medications reset:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
