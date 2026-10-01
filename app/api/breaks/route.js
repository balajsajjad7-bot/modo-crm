import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { resolveShift } from "@/lib/payroll";
import { pauseAgentDialer } from "@/lib/dialer";

// Agent starts or ends a break
export async function POST(req) {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const { action } = await req.json();
  const open = await db.breakLog.findFirst({ where: { userId: session.uid, end: null } });
  let dialer = null;
  if (action === "start") {
    if (open) return NextResponse.json({ error: "You're already on a break." }, { status: 400 });
    const user = await db.user.findUnique({ where: { id: session.uid } });
    await db.breakLog.create({ data: { userId: user.id, shiftDate: resolveShift(user).shiftDate } });
    dialer = await pauseAgentDialer(session.uid, true, "BREAK"); // pause the dialer while on break
  } else if (open) {
    await db.breakLog.update({ where: { id: open.id }, data: { end: new Date() } });
    // Only make the dialer ready again if the agent is Available (not still Away/Busy)
    const u = await db.user.findUnique({ where: { id: session.uid }, select: { status: true } });
    if (!u?.status || u.status === "available") dialer = await pauseAgentDialer(session.uid, false);
  }
  return NextResponse.json({ ok: true, dialer });
}
