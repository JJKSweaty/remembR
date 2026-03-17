import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { barcode } = await req.json();

    if (!barcode) {
      return NextResponse.json({ error: "Barcode is required" }, { status: 400 });
    }

    // Look up the medication by barcode
    const { data: med, error } = await supabase
      .from("medications")
      .select("*")
      .eq("barcode", barcode)
      .maybeSingle();

    if (error) {
      console.error("Error verifying medication:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!med) {
      return NextResponse.json({ 
        found: false, 
        message: "This medication is not in your current care plan." 
      });
    }

    // Prepare response based on taken_today status
    let message = `I found your ${med.name}. `;
    if (med.taken_today) {
      message += `You have already taken this medication today.`;
    } else {
      message += `You should take ${med.dosage || "the prescribed dose"} now.`;
    }

    return NextResponse.json({
      found: true,
      status: med.taken_today ? "already_taken" : "pending",
      medication_name: med.name,
      dosage: med.dosage,
      taken_today: med.taken_today,
      message,
      safety_notice: "Please confirm the bottle label before use."
    });

  } catch (error) {
    console.error("Error in medication verification API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
