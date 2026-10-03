import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, supervisorHas } from "@/lib/auth";
import { CRITERIA, CHECKS } from "@/lib/qa";

const OFF = () => Number(process.env.TZ_OFFSET_MIN ?? 300) * 60000;
const day = (d) => new Date(new Date(d).getTime() + OFF()).toISOString().slice(0, 10);
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// Quality reports. ?from=YYYY-MM-DD&to=YYYY-MM-DD&agent=<id>   (agents only get their own)
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const to = q.get("to") || day(Date.now()); const from = q.get("from") || day(Date.now() - 13 * 86400000);
  const where = { createdAt: { gte: new Date(new Date(from + "T00:00:00Z").getTime() - OFF()), lt: new Date(new Date(to + "T00:00:00Z").getTime() - OFF() + 86400000) } };
  const mgr = s.role === "ADMIN" || (s.role === "SUPERVISOR" && await supervisorHas(s, "quality"));
  if (!mgr) where.userId = s.uid; else if (q.get("agent")) where.userId = q.get("agent");
  const reviews = await db.qaReview.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000 });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(reviews.map((r) => r.userId))] } }, select: { id: true, name: true, agentId: true } });
  const rows = reviews.map((r) => {
    const sc = J(r.scores, {}), gr = J(r.grammar, []), co = J(r.compliance, []), u = users.find((x) => x.id === r.userId);
    return { id: r.id, callSessionId: r.callSessionId, userId: r.userId, agent: u?.name || "Former agent", agentId: u?.agentId, at: r.createdAt, overall: r.overall, scores: sc,
      grammarCount: gr.length, grammar: gr, fillers: r.fillers, wpm: r.wpm, agentNervous: r.agentNervous, customerNervous: r.customerNervous, sentiment: r.sentiment, outcome: r.outcome,
      compliancePassed: co.filter((c) => c.passed).length, complianceTotal: co.length, compliance: co, summary: r.summary };
  });
  const avg = (a) => (a.length ? Math.round(a.reduce((t, x) => t + x, 0) / a.length) : null);
  const avg1 = (a) => (a.length ? +(a.reduce((t, x) => t + x, 0) / a.length).toFixed(1) : null);
  const byAgent = users.map((u) => {
    const R = rows.filter((r) => r.userId === u.id);
    const mistakes = R.flatMap((r) => r.grammar).slice(0, 8);
    return { id: u.id, name: u.name, agentId: u.agentId, calls: R.length, avg: avg(R.map((r) => r.overall)),
      criteria: Object.fromEntries(CRITERIA.map((k) => [k, avg1(R.map((r) => r.scores[k]).filter((x) => x != null))])),
      grammarPerCall: avg1(R.map((r) => r.grammarCount)), fillersPerCall: avg1(R.map((r) => r.fillers)), nervous: avg(R.map((r) => r.agentNervous).filter((x) => x != null)),
      compliance: R.length ? Math.round((R.reduce((t, r) => t + r.compliancePassed, 0) / Math.max(1, R.reduce((t, r) => t + r.complianceTotal, 0))) * 100) : null,
      sales: R.filter((r) => r.outcome === "sale").length, mistakes };
  }).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const days = []; for (let t = new Date(from + "T12:00:00Z"); day(t) <= to && days.length < 120; t = new Date(t.getTime() + 86400000)) days.push(day(t));
  const perDay = days.map((d) => { const R = rows.filter((r) => day(r.at) === d); return { day: d, calls: R.length, avg: avg(R.map((r) => r.overall)), nervous: avg(R.map((r) => r.agentNervous).filter((x) => x != null)) }; });
  const complianceItems = CHECKS.map((item) => { const all = rows.flatMap((r) => r.compliance.filter((c) => c.item === item)); return { item, passRate: all.length ? Math.round((all.filter((c) => c.passed).length / all.length) * 100) : null, checked: all.length }; });
  const totals = { calls: rows.length, avg: avg(rows.map((r) => r.overall)), grammar: rows.reduce((t, r) => t + r.grammarCount, 0), fillers: avg1(rows.map((r) => r.fillers)),
    nervous: avg(rows.map((r) => r.agentNervous).filter((x) => x != null)), compliance: rows.length ? Math.round((rows.reduce((t, r) => t + r.compliancePassed, 0) / Math.max(1, rows.reduce((t, r) => t + r.complianceTotal, 0))) * 100) : null,
    sales: rows.filter((r) => r.outcome === "sale").length };
  const pending = s.role === "ADMIN" ? await db.callSession.count({ where: { endedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 30 * 86400000) } } }) - await db.qaReview.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }) : 0;
  return NextResponse.json({ from, to, totals, byAgent, perDay, complianceItems, rows: rows.map(({ grammar, compliance, ...r }) => r), pending: Math.max(0, pending) });
}
