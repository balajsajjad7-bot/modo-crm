import { NextResponse } from "next/server";
import { guard } from "@/lib/testGuard";
import { getTest, saveTest, saveAudio } from "@/lib/hiring";
import { transcribe } from "@/lib/transcribe";

export const maxDuration = 60;
// A spoken answer: keep the recording for the recruiter, turn it into text, store it. Text isn't shown to the candidate.
export async function POST(req, { params }) {
  const r = await guard(params.token); if (r.error) return r.error;
  const { c } = r; const t = await getTest(c);
  if (!t.startedAt || t.finishedAt) return NextResponse.json({ error: "The test isn't running." }, { status: 400 });
  const form = await req.formData();
  const it = t.items.find((i) => i.id === form.get("item"));
  if (!it || !it.type.startsWith("speak")) return NextResponse.json({ error: "Unknown question." }, { status: 400 });
  if (t.answers[it.id]) return NextResponse.json({ ok: true });
  const audio = form.get("audio");
  if (!audio || typeof audio !== "object" || audio.size < 1500) return NextResponse.json({ error: "We couldn't hear anything — check your microphone and record again." }, { status: 400 });
  if (audio.size > 8 * 1024 * 1024) return NextResponse.json({ error: "That recording is too long." }, { status: 400 });
  const buf = Buffer.from(await audio.arrayBuffer());
  await saveAudio(c.id, it.id, buf, audio.type || "audio/webm");
  let transcript = null;
  try { transcript = await transcribe(new File([buf], audio.name || "answer.webm", { type: audio.type || "audio/webm" })); } catch {}
  const fresh = await getTest(c); // another answer may have landed meanwhile
  fresh.answers[it.id] = { transcript, secs: Math.max(1, Math.min(600, Number(form.get("secs")) || 0)) || null, audio: true };
  await saveTest(c, fresh);
  return NextResponse.json({ ok: true });
}
