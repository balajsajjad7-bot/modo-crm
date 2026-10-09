import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { getAudio } from "@/lib/hiring";

// Play a candidate's recorded answer (admin only).
export async function GET(req) {
  const { error } = await requireManager("hiring");
  if (error) return error;
  const u = new URL(req.url);
  const b = await getAudio(String(u.searchParams.get("id") || ""), String(u.searchParams.get("item") || "").replace(/[^\w]/g, ""));
  if (!b) return NextResponse.json({ error: "No recording." }, { status: 404 });
  return new NextResponse(Buffer.from(b.data), { headers: { "content-type": b.mime || "audio/webm", "cache-control": "private, no-store" } });
}
