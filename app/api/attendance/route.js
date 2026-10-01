import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { resolveShift, rates, breakSeconds } from "@/lib/payroll";
import { slipsFor } from "@/lib/month";
import { getSettings } from "@/lib/settings";

// Agent: today's status, breaks, target progress, last call score, month payslip
export async function GET() {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  const settings = await getSettings();
  const { shiftDate, start } = resolveShift(user);
  const [today, breaks, sales, lastCall, [mine]] = await Promise.all([
    db.attendance.findUnique({ where: { userId_shiftDate: { userId: user.id, shiftDate } } }),
    db.breakLog.findMany({ where: { userId: user.id, shiftDate }, orderBy: { start: "asc" } }),
    db.sale.findMany({ where: { userId: user.id, shiftDate }, select: { status: true } }),
    db.callSession.findFirst({ where: { userId: user.id, score: { not: null } }, orderBy: { endedAt: "desc" }, select: { score: true, review: true, endedAt: true } }),
    slipsFor([user], new Date().toISOString().slice(0, 7)),
  ]);
  return NextResponse.json({
    name: user.name, agentId: user.agentId, shiftStart: user.shiftStart, shiftHours: user.shiftHours, shiftStartsAt: start,
    today, slip: mine.slip, rates: rates(user),
    breaks: { usedSeconds: breaks.reduce((s, b) => s + breakSeconds(b), 0), open: breaks.find((b) => !b.end) || null, allowance: settings.breakAllowance * 60 },
    target: { goal: settings.dailyTarget, submitted: sales.length, verified: sales.filter((s) => s.status === "VERIFIED").length, bonusPerSale: settings.bonusPerSale },
    idleAfter: settings.idleAfter, lastCall,
  });
}

// Agent: clock out (also closes an open break). One tap — no code or admin approval.
export async function POST() {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  const { shiftDate } = resolveShift(user);
  const now = new Date();
  await db.breakLog.updateMany({ where: { userId: user.id, end: null }, data: { end: now } });
  await db.attendance.updateMany({ where: { userId: user.id, shiftDate, clockOut: null }, data: { clockOut: now } });
  return NextResponse.json({ ok: true });
}

// Admin: waive a late deduction or add a note
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const { id, waived, note } = await req.json();
  return NextResponse.json(await db.attendance.update({ where: { id }, data: { waived: !!waived, note } }));
}
