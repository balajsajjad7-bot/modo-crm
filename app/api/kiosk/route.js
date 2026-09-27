import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { kioskToken } from "@/lib/presence";
import { resolveShift } from "@/lib/payroll";

// Office screen data: current QR token and who has arrived today.
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" } });
  const att = await db.attendance.findMany({ where: { userId: { in: agents.map((a) => a.id) }, clockIn: { gte: new Date(Date.now() - 20 * 3600000) } } });
  const rows = agents.map((a) => {
    const x = att.find((r) => r.userId === a.id && r.shiftDate === resolveShift(a).shiftDate);
    return { name: a.name, agentId: a.agentId, in: !!x && !x.clockOut, at: x?.clockIn || null, late: x?.lateSeconds || 0, location: x?.location || null };
  });
  const origin = new URL(req.url).origin;
  const { token, expiresIn } = kioskToken();
  return NextResponse.json({ token, expiresIn, url: `${origin}/checkin?t=${token}`, rows });
}
