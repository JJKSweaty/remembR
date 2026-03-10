import { NextResponse } from "next/server";

// Proxy ESP32 commands server-side to avoid CORS restrictions
// Browser calls /api/esp/pause → this calls http://ESP_IP/pause server-side
export async function POST(
  req: Request,
  { params }: { params: Promise<{ command: string }> }
) {
  const { command } = await params;
  const body = await req.json().catch(() => ({}));
  const espUrl: string = body.espUrl;

  if (!espUrl) {
    return NextResponse.json({ error: "No ESP URL provided" }, { status: 400 });
  }

  const url = `${espUrl.replace(/\/+$/, "")}/${command}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
