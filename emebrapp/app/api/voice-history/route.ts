import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("voice_history")
      .select("id, transcript, response, created_at")
      .order("created_at", { ascending: true })
      .limit(60);

    if (error) {
      console.error("Error fetching voice history:", error);
      return NextResponse.json({ history: [] });
    }

    return NextResponse.json({ history: data || [] });
  } catch (error) {
    console.error("Voice history API error:", error);
    return NextResponse.json({ history: [] });
  }
}
