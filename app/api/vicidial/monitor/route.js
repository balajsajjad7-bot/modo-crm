import { NextResponse } from "next/server";

export const maxDuration = 60;
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { blindMonitor } from "@/lib/vicidial";

// { userId? (Modo agent) | vicidialUser?, stage: MONITOR | WHISPER | BARGE }
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  let vu = String(b.vicidialUser || "").trim();
  if (!vu && b.userId) { const u = await db.user.findUnique({ where: { id: b.userId }, select: { vicidialUser: true, agentId: true } }); vu = u?.vicidialUser || u?.agentId || ""; }
  if (!vu) return NextResponse.json({ error: "Which VICIdial user is this agent? Set it on the agent's page (VICIdial user)." }, { status: 400 });
  try { const r = await blindMonitor(vu, b.stage); return NextResponse.json({ ok: true, message: `Your phone (${r.phone}) is ringing. Answer it to ${b.stage === "BARGE" ? "join" : b.stage === "WHISPER" ? "whisper to" : "listen to"} ${vu}'s call.` }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
