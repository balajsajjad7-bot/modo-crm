import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { breakSeconds } from "@/lib/payroll";

// Break report: every break between two shift dates, with per-day allowance and overage.
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const q = new URL(req.url).searchParams;
  const to = q.get("to") || new Date().toISOString().slice(0, 10);
  const from = q.get("from") || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const where = { shiftDate: { gte: from, lte: to } };
  if (q.get("agent")) where.userId = q.get("agent");
  const [breaks, agents, s] = await Promise.all([
    db.breakLog.findMany({ where, orderBy: { start: "asc" } }),
    db.user.findMany({ where: { role: "AGENT" }, select: { id: true, name: true, agentId: true, departmentId: true, campaignId: true } }),
    getSettings(),
  ]);
  const allowance = s.breakAllowance * 60;
  const days = {};
  for (const b of breaks) { const k = b.userId + "|" + b.shiftDate; (days[k] = days[k] || []).push(b); }
  const rows = Object.entries(days).map(([k, list]) => {
    const [uid, date] = k.split("|"); const a = agents.find((x) => x.id === uid);
    const total = list.reduce((t, b) => t + breakSeconds(b), 0);
    return { userId: uid, name: a?.name || "Former agent", agentId: a?.agentId, departmentId: a?.departmentId, campaignId: a?.campaignId, date, count: list.length, total, over: Math.max(0, total - allowance), open: list.some((b) => !b.end),
      breaks: list.map((b) => ({ start: b.start, end: b.end, seconds: breakSeconds(b) })) };
  }).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.name.localeCompare(y.name)));
  const perAgent = agents.map((a) => { const r = rows.filter((x) => x.userId === a.id); return { id: a.id, name: a.name, days: r.length, breaks: r.reduce((t, x) => t + x.count, 0), total: r.reduce((t, x) => t + x.total, 0), over: r.reduce((t, x) => t + x.over, 0) }; }).filter((x) => x.breaks);
  return NextResponse.json({ from, to, allowance, rows, perAgent });
}
