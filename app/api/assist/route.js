import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { askAI } from "@/lib/ai";
import { runQA } from "@/lib/qa";

// Transcript lines are stored as "A: …" (agent) and "C: …" (customer).
const readable = (t) => t.split("\n").filter(Boolean).map((l) => (l.startsWith("C: ") ? "Customer: " + l.slice(3) : l.startsWith("A: ") ? "Agent: " + l.slice(3) : "Agent: " + l)).join("\n");

const LIVE = `You coach a call-center sales agent live and brief their supervisor. You get the latest transcript lines.
Lines start with "Agent:" or "Customer:". If there are no Customer lines, only the agent's microphone is being captured.
Return JSON only:
{"next": "one short, natural sentence the agent could say next to move the sale forward honestly",
 "tone": "calm" | "rushed" | "nervous" | "pushy",
 "tip": "max 12 words of coaching",
 "summary": "one plain sentence for the supervisor: what the call is about right now",
 "mood": "interested" | "neutral" | "hesitant" | "annoyed" | "unknown",
 "confused": "agent" | "customer" | "both" | "none",
 "confusedNote": "max 12 words: what the confusion is about, or empty",
 "agentState": "calm" | "nervous" | "rushed" | "confused",
 "customerState": "calm" | "nervous" | "annoyed" | "confused" | "interested" | "unknown",
 "agentNervous": 0-100, "customerNervous": 0-100,
 "objection": "the customer's latest objection in a few words, or empty",
 "rebuttal": "one honest, natural answer to that objection (use the company's approved answer if there is one), or empty",
 "questions": [{"q": "a question the customer just asked", "a": "a short, correct answer the agent can give"}],
 "facts": {"name": "", "provider": "", "bill": "monthly amount as a number or empty", "lines": "", "zip": "", "email": "", "address": "", "wants": "what they want, short"},
 "checklist": {"intro": true|false, "recorded": true|false, "needs": true|false, "price": true|false, "terms": true|false, "agreement": true|false, "confirmed": true|false},
 "buyingSignal": "short phrase if the customer sounds ready to buy, or empty",
 "warning": "short warning if the agent said something risky (wrong price, promise, pressure), or empty"}
checklist = has the agent done it at any point in the call so far: introduced self+company, said the call may be recorded, asked about needs, stated the price clearly, explained contract/fees, got a clear yes, confirmed details. facts = only what was actually said.
Nervousness signs: filler words (um, uh, like, I mean), false starts, repeating themselves, apologising a lot, very short or trailing answers, over-explaining, uncertainty ("I think", "maybe", "not sure").
Use "unknown"/0 for the customer when there are no Customer lines.
Judge confusion from what is said: repeated questions, "I don't understand", mixed-up prices or terms, the agent re-explaining, the agent unsure of facts.
Never suggest misleading claims, pressure tactics, or skipping disclosures.`;

export async function POST(req) {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const { sessionId, chunk, speaker, end, endedBy, customerSide } = await req.json();
  let s = sessionId ? await db.callSession.findFirst({ where: { id: sessionId, userId: session.uid } }) : null;
  if (!s) s = await db.callSession.create({ data: { userId: session.uid } });

  if (end) {
    const data = { endedAt: new Date() };
    if (["customer", "agent"].includes(endedBy)) { data.endedBy = endedBy; data.endedBySource = "agent"; }
    if (!data.endedBy) { data.endedBy = "unknown"; data.endedBySource = "agent"; }
    await db.callSession.update({ where: { id: s.id }, data });
    try { await runQA(s.id); } catch {} // the QA department reviews every call
    const u = await db.callSession.findUnique({ where: { id: s.id } });
    return NextResponse.json({ sessionId: s.id, score: u.score, review: u.review && JSON.parse(u.review) });
  }

  const tag = speaker === "C" ? "C: " : "A: ";
  const said = String(chunk || "").trim();
  const transcript = (s.transcript + (said ? "\n" + tag + said : "")).trim().slice(-20000);
  if (!transcript) return NextResponse.json({ sessionId: s.id }); // just opening the session
  let out = null;
  const camp = (await db.user.findUnique({ where: { id: session.uid }, select: { campaignId: true } }).catch(() => null))?.campaignId || "";
  try { out = await askAI(LIVE, readable(transcript).slice(-4000), { json: true, maxTokens: 900, campaignId: camp }); } catch (e) { out = { next: "", tip: e.message, tone: null }; }
  await db.callSession.update({ where: { id: s.id }, data: {
    transcript, lastTip: out?.next || null, tone: out?.tone || null, customerSide: s.customerSide || !!customerSide || speaker === "C",
    ...(out?.summary ? { summary: out.summary } : {}), ...(out?.mood ? { mood: out.mood } : {}),
    ...(out?.confused ? { confused: out.confused, confusedNote: out.confusedNote || null } : {}),
    ...(out?.agentState ? { agentState: out.agentState } : {}), ...(out?.customerState ? { customerState: out.customerState } : {}),
    ...(out ? { live: JSON.stringify({ ...(() => { let prev = {}; try { prev = JSON.parse(s.live || "{}").checklist || {}; } catch {} const cl = { ...(out.checklist || {}) }; for (const k of Object.keys(prev)) if (prev[k]) cl[k] = true; out.checklist = cl; return {}; })(), objection: out.objection || "", rebuttal: out.rebuttal || "", questions: Array.isArray(out.questions) ? out.questions.slice(0, 3) : [], facts: out.facts || {}, checklist: out.checklist || {}, buyingSignal: out.buyingSignal || "", warning: out.warning || "" }) } : {}),
    ...(Number.isFinite(Number(out?.agentNervous)) ? { agentNerv: Math.max(0, Math.min(100, Math.round(Number(out.agentNervous)))) } : {}),
    ...(Number.isFinite(Number(out?.customerNervous)) ? { custNerv: Math.max(0, Math.min(100, Math.round(Number(out.customerNervous)))) } : {}),
  } });
  return NextResponse.json({ sessionId: s.id, ...out });
}
