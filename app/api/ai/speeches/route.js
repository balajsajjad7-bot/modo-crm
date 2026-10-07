import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, requireRole } from "@/lib/auth";
import { getSpeeches, saveSpeeches, speechesFor, seedList, getScores, recordScore } from "@/lib/speeches";
import { askAI, clearKnowledgeCache } from "@/lib/ai";

// Campaign speeches. Admin/supervisor: all of them + edit. Agent: the speech for their own campaign (+ general ones).
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const campaigns = await db.campaign.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });
  if (s.role === "ADMIN" || s.role === "SUPERVISOR") {
    const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, campaignId: true } });
    return NextResponse.json({ list: await getSpeeches(), campaigns, admin: true, seeds: await seedList(), scores: await getScores(), agents });
  }
  const me = await db.user.findUnique({ where: { id: s.uid }, select: { campaignId: true } });
  const scores = await getScores();
  const list = (await speechesFor(me?.campaignId || "")).map((x) => ({ ...x, myBest: scores[x.id]?.[s.uid]?.best ?? null }));
  return NextResponse.json({ list, campaigns, campaignId: me?.campaignId || "" });
}

export async function PUT(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const campaigns = await db.campaign.findMany({ select: { id: true, name: true } });
  const list = (b.list || []).map((x) => ({ ...x, campaign: campaigns.find((c) => c.id === x.campaignId)?.name || "", updatedAt: x.dirty ? new Date().toISOString() : x.updatedAt }));
  const saved = await saveSpeeches(list);
  clearKnowledgeCache();
  return NextResponse.json({ ok: true, list: saved });
}

// Practice: an agent (or admin) writes how they'd pitch; Modo compares it with the admin's speech and coaches.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const sp = (await getSpeeches()).find((x) => x.id === b.id);
  if (!sp) return NextResponse.json({ error: "Speech not found." }, { status: 404 });
  const attempt = String(b.text || "").trim().slice(0, 4000);
  if (attempt.length < 15) return NextResponse.json({ error: "Write (or paste) how you'd say it first." }, { status: 400 });
  try {
    const out = await askAI(`You are Modo, a friendly sales trainer at a US call center (agents are from Pakistan, speaking to Americans). Compare the agent's attempt with the official speech below.
Reply with JSON only: {"score": 0-100, "good": ["…"], "fix": ["what's missing or wrong, short"], "say": "the 2–4 best lines to say next time, in natural American English"}.
The agent may practise only one part (opening, discovery, pitch, one objection, recap or close) — judge it against the matching part of the speech, not the whole call. Be encouraging and specific. Penalise anything the speech says never to say, invented prices or promises, or claiming to be the carrier.

OFFICIAL SPEECH (${sp.campaign || "all campaigns"} · ${sp.title}):
${sp.text}${sp.dos ? "\nAlways: " + sp.dos : ""}${sp.donts ? "\nNever: " + sp.donts : ""}`, attempt, { json: true, maxTokens: 700, knowledge: false });
    const score = Math.max(0, Math.min(100, Number(out?.score) || 0));
    await recordScore(sp.id, { uid: s.uid, name: s.name || (await db.user.findUnique({ where: { id: s.uid }, select: { name: true } }))?.name }, score).catch(() => {});
    return NextResponse.json({ score, good: [].concat(out?.good || []).slice(0, 5), fix: [].concat(out?.fix || []).slice(0, 6), say: String(out?.say || "") });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
