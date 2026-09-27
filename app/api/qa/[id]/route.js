import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, requireRole } from "@/lib/auth";
import { runQA, LABELS } from "@/lib/qa";

const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
// One call's full QA report (the agent can open their own)
export async function GET(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const r = await db.qaReview.findUnique({ where: { id: params.id } });
  if (!r || (s.role !== "ADMIN" && r.userId !== s.uid)) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const [call, u] = await Promise.all([db.callSession.findUnique({ where: { id: r.callSessionId } }), db.user.findUnique({ where: { id: r.userId }, select: { name: true, agentId: true } })]);
  return NextResponse.json({ ...r, labels: LABELS, scores: J(r.scores, {}), grammar: J(r.grammar, []), nervous: J(r.nervous, []), compliance: J(r.compliance, []), highlights: J(r.highlights, {}),
    agent: u, call: call && { startedAt: call.startedAt, endedAt: call.endedAt, transcript: call.transcript, endedBy: call.endedBy, endedBySource: call.endedBySource, confused: call.confused, confusedNote: call.confusedNote, customerSide: call.customerSide } });
}
// Admin: run the review again
export async function POST(req, { params }) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const r = await db.qaReview.findUnique({ where: { id: params.id } });
  if (!r) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  try { const q = await runQA(r.callSessionId); return NextResponse.json({ id: q?.id }); } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
