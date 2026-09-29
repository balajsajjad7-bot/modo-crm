import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { recordingLookup } from "@/lib/vicidial";

// Admin: list VICIdial call recordings. ?date=YYYY-MM-DD&agent=&lead=&phone=
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const q = new URL(req.url).searchParams;
  try {
    const rows = await recordingLookup({ date: q.get("date"), agentUser: q.get("agent"), leadId: q.get("lead"), phone: q.get("phone") });
    return NextResponse.json({ rows });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
