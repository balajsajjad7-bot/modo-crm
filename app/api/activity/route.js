import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { resolveShift } from "@/lib/payroll";

// Agent's browser reports a stretch of time away from the CRM tab or with no mouse/keyboard.
export async function POST(req) {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const { kind, start, end } = await req.json();
  const s = new Date(start), e = new Date(end);
  const seconds = Math.floor((e - s) / 1000);
  if (!["AWAY", "IDLE"].includes(kind) || !(seconds > 0) || seconds > 16 * 3600) return NextResponse.json({ error: "Invalid activity." }, { status: 400 });
  const onBreak = await db.breakLog.findFirst({ where: { userId: session.uid, start: { lte: s }, OR: [{ end: null }, { end: { gte: e } }] } });
  if (onBreak) return NextResponse.json({ ok: true, skipped: "break" }); // time on break is not idle time
  const user = await db.user.findUnique({ where: { id: session.uid } });
  await db.activity.create({ data: { userId: user.id, shiftDate: resolveShift(user, s).shiftDate, kind, start: s, end: e, seconds } });
  return NextResponse.json({ ok: true });
}

// Admin: today's activity log
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const since = new Date(Date.now() - 14 * 3600000);
  const list = await db.activity.findMany({ where: { end: { gte: since } }, orderBy: { start: "desc" }, take: 200, include: { user: { select: { name: true, agentId: true } } } });
  return NextResponse.json(list);
}
