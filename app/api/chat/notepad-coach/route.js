import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { tick, coachAllNow } from "@/lib/coach";

export const maxDuration = 60;

// Automatic tick: any open Modo (and the GitHub heartbeat) calls this every few minutes. It only coaches
// agents whose notepad changed, posts into the admins-only #notepad-coach channel, and returns counts only.
export async function GET() {
  try { const r = await tick({ limit: 2 }); return NextResponse.json({ ok: r.ok, coached: r.coached || 0 }); }
  catch { return NextResponse.json({ ok: false, coached: 0 }); }
}

// Admin: "Coach everyone now"
export async function POST() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (s.role !== "ADMIN") return NextResponse.json({ error: "Only admins can run the notepad coach." }, { status: 403 });
  try { const id = await coachAllNow(s.name); return NextResponse.json({ ok: true, id }); }
  catch (e) { return NextResponse.json({ error: e.message || "The coach couldn't run." }, { status: 400 }); }
}
