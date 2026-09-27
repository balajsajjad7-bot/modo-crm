import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { resolveShift, shiftBounds } from "@/lib/payroll";

// Team → Shifts: every agent's shift in one table, edited in place or in bulk.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const [agents, s] = await Promise.all([db.user.findMany({ where: { role: "AGENT" }, orderBy: { name: "asc" } }), getSettings()]);
  const today = await db.attendance.findMany({ where: { userId: { in: agents.map((a) => a.id) }, clockIn: { gte: new Date(Date.now() - 24 * 3600000) } } });
  return NextResponse.json({
    settings: { shiftEndOut: s.shiftEndOut, shiftEndGrace: s.shiftEndGrace },
    agents: agents.map((u) => {
      const sd = resolveShift(u).shiftDate; const b = shiftBounds(u, sd); const a = today.find((x) => x.userId === u.id && x.shiftDate === sd);
      return { id: u.id, name: u.name, agentId: u.agentId, active: u.active, departmentId: u.departmentId, campaignId: u.campaignId, shiftStart: u.shiftStart, shiftHours: u.shiftHours, workDays: u.workDays, graceMinutes: u.graceMinutes,
        today: { start: b.start, end: b.end, clockIn: a?.clockIn || null, clockOut: a?.clockOut || null, auto: a?.note || null } };
    }),
  });
}
// { ids: [...], shiftStart?, shiftHours?, workDays?, graceMinutes? }  (one agent or many)
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json(); const data = {};
  if (b.shiftStart && /^\d{2}:\d{2}$/.test(b.shiftStart)) data.shiftStart = b.shiftStart;
  if (b.shiftHours != null && b.shiftHours !== "") { const h = Number(b.shiftHours); if (!(h >= 1 && h <= 16)) return NextResponse.json({ error: "Shift length must be 1–16 hours." }, { status: 400 }); data.shiftHours = h; }
  if (typeof b.workDays === "string") data.workDays = b.workDays;
  if (b.graceMinutes != null && b.graceMinutes !== "") data.graceMinutes = Math.max(0, parseInt(b.graceMinutes) || 0);
  if (!Array.isArray(b.ids) || !b.ids.length || !Object.keys(data).length) return NextResponse.json({ error: "Pick agents and something to change." }, { status: 400 });
  const r = await db.user.updateMany({ where: { id: { in: b.ids }, role: "AGENT" }, data });
  return NextResponse.json({ updated: r.count });
}
