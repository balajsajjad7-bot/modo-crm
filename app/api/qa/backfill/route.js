import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { runQA } from "@/lib/qa";
// Admin: review up to 5 finished calls from the last 30 days that don't have a QA report yet (press again for more)
export async function POST() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const done = new Set((await db.qaReview.findMany({ select: { callSessionId: true } })).map((x) => x.callSessionId));
  const calls = (await db.callSession.findMany({ where: { endedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 30 * 86400000) } }, orderBy: { startedAt: "desc" }, take: 300, select: { id: true, transcript: true } }))
    .filter((c) => !done.has(c.id) && c.transcript.split(/\s+/).length >= 15).slice(0, 5);
  let ok = 0, failed = 0;
  for (const c of calls) { try { (await runQA(c.id)) ? ok++ : failed++; } catch { failed++; } }
  return NextResponse.json({ reviewed: ok, failed });
}
