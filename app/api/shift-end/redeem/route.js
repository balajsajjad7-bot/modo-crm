import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { hash } from "@/lib/shiftEnd";

const tries = new Map();
// Agent enters the code → clocked out now
export async function POST(req) {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const n = (tries.get(session.uid) || 0) + 1; tries.set(session.uid, n);
  if (n > 8) return NextResponse.json({ error: "Too many wrong codes. Ask admin for a new one." }, { status: 429 });
  const { code } = await req.json();
  const r = await db.shiftEndRequest.findFirst({ where: { userId: session.uid, status: "approved", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!r || r.codeHash !== hash(String(code || "").replace(/\D/g, ""))) return NextResponse.json({ error: "That code isn't right (or it expired)." }, { status: 400 });
  tries.delete(session.uid);
  const now = new Date();
  await db.shiftEndRequest.update({ where: { id: r.id }, data: { status: "used", usedAt: now } });
  await db.breakLog.updateMany({ where: { userId: session.uid, end: null }, data: { end: now } });
  await db.attendance.updateMany({ where: { userId: session.uid, shiftDate: r.shiftDate, clockOut: null }, data: { clockOut: now, note: `Ended early, approved by ${r.decidedBy}: ${r.reason}` } });
  return NextResponse.json({ ok: true });
}
