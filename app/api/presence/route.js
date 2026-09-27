import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { resolveShift, breakSeconds } from "@/lib/payroll";
import { autoCloseStale } from "@/lib/presence";

// Live "who's where" board for admin.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  await autoCloseStale().catch(() => {});
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" } });
  const ids = agents.map((a) => a.id);
  const since = new Date(Date.now() - 24 * 3600000);
  const [att, breaks] = await Promise.all([
    db.attendance.findMany({ where: { userId: { in: ids }, clockIn: { gte: since } } }),
    db.breakLog.findMany({ where: { userId: { in: ids }, start: { gte: since } } }),
  ]);
  const now = Date.now();
  return NextResponse.json(agents.map((u) => {
    const sd = resolveShift(u).shiftDate;
    const a = att.find((x) => x.userId === u.id && x.shiftDate === sd);
    const br = breaks.filter((b) => b.userId === u.id && b.shiftDate === sd);
    const onBreak = br.some((b) => !b.end);
    const seen = u.lastSeenAt ? now - new Date(u.lastSeenAt) : Infinity;
    const idle = u.idleSince && seen < 120000;
    const status = !a ? "not in" : a.clockOut ? "clocked out" : onBreak ? "on break" : seen > 120000 ? "away" : idle ? "idle" : u.status === "away" ? "away" : u.status === "busy" ? "busy" : a.location === "remote" ? "remote" : "working";
    return { id: u.id, name: u.name, agentId: u.agentId, shiftStart: u.shiftStart, status, location: a?.location || null, source: a?.source || null,
      clockIn: a?.clockIn || null, clockOut: a?.clockOut || null, autoOut: !!a?.autoOut, lateSeconds: a?.lateSeconds || 0,
      breakSeconds: br.reduce((t, b) => t + breakSeconds(b), 0), lastSeenAt: u.lastSeenAt,
      idleSince: idle ? u.idleSince : null, manual: u.status, statusAt: u.statusAt, departmentId: u.departmentId, campaignId: u.campaignId,
      awayReason: !a || a.clockOut || onBreak ? null : seen > 120000 ? "CRM closed" : idle ? "no activity" : u.status === "away" ? "set by agent" : null };
  }));
}
