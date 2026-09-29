import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

// Save/update a manual QA score on one recording. { recId, agentUser, callDate, phone, url, score, checklist, notes, outcome }
export async function POST(req) {
  const { session, error } = await requireManager("recordings");
  if (error) return error;
  const b = await req.json();
  if (!b.recId) return NextResponse.json({ error: "Missing recording id." }, { status: 400 });
  const data = {
    agentUser: b.agentUser || null, callDate: b.callDate || null, phone: b.phone || null, url: b.url || null,
    score: Math.max(0, Math.min(100, parseInt(b.score) || 0)),
    checklist: JSON.stringify(b.checklist || {}), notes: String(b.notes || "").slice(0, 3000) || null,
    outcome: b.outcome || null, reviewedBy: session.name,
  };
  const r = await db.recordingQa.upsert({ where: { recId: b.recId }, update: data, create: { recId: b.recId, ...data } });
  return NextResponse.json({ ok: true, id: r.id });
}
