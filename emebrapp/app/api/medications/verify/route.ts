import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { barcode, medication_name } = await req.json();
    const searchTerm = (medication_name || barcode || "").trim().toLowerCase();

    if (!searchTerm) {
      return NextResponse.json({
        found: false,
        message: "I couldn't read the medication information. Please try scanning again.",
      });
    }

    const { data: medications } = await supabase
      .from("medications")
      .select("id, name, dosage, schedule, taken_today");

    if (!medications || medications.length === 0) {
      return NextResponse.json({
        found: false,
        message: "You don't have any medications in your care plan yet.",
      });
    }

    const match = medications.find(
      (m) =>
        m.name.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(m.name.toLowerCase())
    );

    if (!match) {
      return NextResponse.json({
        found: false,
        message: "I couldn't find this medication in your care plan. Please check with your caregiver before taking it.",
      });
    }

    const alreadyTaken = match.taken_today;
    return NextResponse.json({
      found: true,
      status: alreadyTaken ? "already_taken" : "match",
      medication_name: match.name,
      dosage: match.dosage,
      taken_today: alreadyTaken,
      plan_slot: match.schedule,
      safety_notice: alreadyTaken
        ? "You have already taken this medication today."
        : "This medication is in your care plan. Take as directed.",
      message: alreadyTaken
        ? `You already took your ${match.name} today. If you're unsure, please check with your caregiver.`
        : `This is your ${match.name}${match.dosage ? `, ${match.dosage}` : ""}. It is scheduled for ${match.schedule}.`,
    });
  } catch {
    return NextResponse.json(
      { found: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
