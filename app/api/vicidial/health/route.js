import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { viciHealth } from "@/lib/vicidialHealth";

export const maxDuration = 60;
// Admin → Dialer setup → "Check connection"
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try { return NextResponse.json(await viciHealth()); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
