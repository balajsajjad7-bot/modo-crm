import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { STAGES } from "@/lib/crm";

const OFFSET = () => Number(process.env.TZ_OFFSET_MIN ?? 300) * 60000;
const localDay = (d) => new Date(new Date(d).getTime() + OFFSET()).toISOString().slice(0, 10);

// Dashboard numbers. ?days=14|30|90  (agents only see their own)
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const days = Math.min(180, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 14));
  const since = new Date(Date.now() - days * 86400000);
  const mine = s.role === "ADMIN" ? {} : { userId: s.uid };
  const [sales, deals, att, tasksDone, agents, calls] = await Promise.all([
    db.sale.findMany({ where: { ...mine, createdAt: { gte: since } }, select: { userId: true, status: true, amount: true, createdAt: true } }),
    db.deal.findMany({ where: s.role === "ADMIN" ? {} : { ownerId: s.uid }, select: { stage: true, value: true, ownerId: true, updatedAt: true } }),
    db.attendance.findMany({ where: { ...mine, clockIn: { gte: since } }, select: { userId: true, lateSeconds: true, shiftDate: true, location: true, source: true } }),
    db.task.count({ where: { ...(s.role === "ADMIN" ? {} : { assigneeId: s.uid }), done: true, doneAt: { gte: since } } }),
    db.user.findMany({ where: { role: "AGENT", ...(s.role === "ADMIN" ? {} : { id: s.uid }) }, select: { id: true, name: true } }),
    db.callSession.findMany({ where: { ...mine, score: { not: null }, startedAt: { gte: since } }, select: { userId: true, score: true } }),
  ]);
  const dayList = Array.from({ length: days }, (_, i) => localDay(Date.now() - (days - 1 - i) * 86400000));
  const perDay = dayList.map((d) => {
    const x = sales.filter((v) => localDay(v.createdAt) === d);
    return { day: d, submitted: x.length, verified: x.filter((v) => v.status === "VERIFIED").length, revenue: x.filter((v) => v.status === "VERIFIED").reduce((t, v) => t + (v.amount || 0), 0), late: att.filter((a) => a.shiftDate === d && a.lateSeconds > 0).length };
  });
  const byAgent = agents.map((a) => {
    const x = sales.filter((v) => v.userId === a.id), c = calls.filter((v) => v.userId === a.id), at = att.filter((v) => v.userId === a.id);
    return { name: a.name, submitted: x.length, verified: x.filter((v) => v.status === "VERIFIED").length, revenue: x.filter((v) => v.status === "VERIFIED").reduce((t, v) => t + (v.amount || 0), 0),
      avgScore: c.length ? Math.round(c.reduce((t, v) => t + v.score, 0) / c.length) : null, lateDays: at.filter((v) => v.lateSeconds > 0).length, daysIn: at.length };
  }).sort((a, b) => b.verified - a.verified || b.revenue - a.revenue);
  const pipeline = STAGES.map((st) => ({ ...st, count: deals.filter((d) => d.stage === st.id).length, value: deals.filter((d) => d.stage === st.id).reduce((t, d) => t + d.value, 0) }));
  const won = deals.filter((d) => d.stage === "won").length, lost = deals.filter((d) => d.stage === "lost").length;
  const verified = sales.filter((v) => v.status === "VERIFIED");
  return NextResponse.json({
    days, perDay, byAgent, pipeline,
    kpis: {
      submitted: sales.length, verified: verified.length, revenue: verified.reduce((t, v) => t + (v.amount || 0), 0),
      verifyRate: sales.length ? Math.round((verified.length / sales.length) * 100) : 0,
      winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null, openPipeline: deals.filter((d) => !["won", "lost"].includes(d.stage)).reduce((t, d) => t + d.value, 0),
      onTime: att.length ? Math.round((att.filter((a) => !a.lateSeconds).length / att.length) * 100) : null,
      inOffice: att.length ? Math.round((att.filter((a) => a.location === "office").length / att.length) * 100) : null,
      tasksDone, avgScore: calls.length ? Math.round(calls.reduce((t, v) => t + v.score, 0) / calls.length) : null,
    },
  });
}
