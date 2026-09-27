import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

// Today's ranking by verified sales (visible to agents and admin; shows names and counts only)
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const since = new Date(Date.now() - 14 * 3600000);
  const [settings, agents, sales, idle] = await Promise.all([
    getSettings(),
    db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true, name: true, agentId: true } }),
    db.sale.findMany({ where: { createdAt: { gte: since } }, select: { userId: true, status: true } }),
    s.role === "ADMIN" ? db.activity.findMany({ where: { end: { gte: since } }, select: { userId: true, seconds: true } }) : [],
  ]);
  const rows = agents.map((a) => {
    const mine = sales.filter((x) => x.userId === a.id);
    return { name: a.name, agentId: a.agentId, submitted: mine.length, verified: mine.filter((x) => x.status === "VERIFIED").length,
      ...(s.role === "ADMIN" ? { idleSeconds: idle.filter((x) => x.userId === a.id).reduce((t, x) => t + x.seconds, 0) } : {}) };
  }).sort((a, b) => b.verified - a.verified || b.submitted - a.submitted);
  return NextResponse.json({ target: settings.dailyTarget, rows });
}
