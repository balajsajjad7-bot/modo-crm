import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { askAI } from "@/lib/ai";
import { loggedInAgents } from "@/lib/vicidial";

// One-click AI briefing of the whole floor: dialer, live calls, recent calls.
export async function POST() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const since = new Date(Date.now() - 3 * 3600000);
  const [calls, dialer] = await Promise.all([
    db.callSession.findMany({ where: { startedAt: { gte: since } }, orderBy: { startedAt: "desc" }, take: 40, include: { user: { select: { name: true } } } }),
    loggedInAgents().catch(() => null),
  ]);
  const snap = {
    dialer: dialer ? dialer.map((a) => ({ user: a.user || a.f0, status: a.status, campaign: a.campaign_id || a.campaign, calls: a.calls_today })) : "not connected",
    live: calls.filter((c) => !c.endedAt).map((c) => ({ agent: c.user.name, minutes: Math.round((Date.now() - c.startedAt) / 60000), summary: c.summary, mood: c.mood, confused: c.confused, confusedNote: c.confusedNote, tone: c.tone })),
    recent: calls.filter((c) => c.endedAt).map((c) => ({ agent: c.user.name, score: c.score, summary: c.summary, confused: c.confused, endedBy: c.endedBy })),
  };
  try {
    const text = await askAI(`You brief a call-center supervisor. From the JSON snapshot, write 4-7 short bullet points: who is on calls and how they're going, anyone confused (agent or customer) who needs help now, customers hanging up, low scores, and dialer issues. Name agents. Plain language, no preamble.`, JSON.stringify(snap), { maxTokens: 700 });
    return NextResponse.json({ text });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
