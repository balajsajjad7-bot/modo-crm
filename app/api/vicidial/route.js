import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loggedInAgents } from "@/lib/vicidial";

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try { return NextResponse.json({ agents: await loggedInAgents() }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
