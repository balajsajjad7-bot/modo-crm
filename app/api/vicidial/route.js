import { NextResponse } from "next/server";

export const maxDuration = 60;
import { requireRole } from "@/lib/auth";
import { loggedInAgents } from "@/lib/vicidial";
import { configFor } from "@/lib/connectors";

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const cfg = (await configFor("vicidial")) || {};
  const monitorPhone = cfg.monitorPhone || process.env.VICIDIAL_MONITOR_PHONE || "";
  try { return NextResponse.json({ agents: await loggedInAgents(), monitorPhone }); }
  catch (e) { return NextResponse.json({ error: e.message, monitorPhone }, { status: 502 }); }
}
