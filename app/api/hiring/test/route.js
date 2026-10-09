import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { loadHiring, getTest } from "@/lib/hiring";
import { scoreItem, SECTIONS } from "@/lib/englishTest";

// Admin review of one candidate's test: every question, their answer, the right answer, transcripts and marks.
export async function GET(req) {
  const { error } = await requireManager("hiring");
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  const v = await loadHiring(); const c = v.candidates.find((x) => x.id === id);
  if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const t = await getTest(c);
  const items = t.items.map((it) => ({ ...it, ans: t.answers[it.id] || null, mark: scoreItem(it, t.answers[it.id]) }));
  return NextResponse.json({ items, sections: SECTIONS, result: t.result || null, events: t.events, startedAt: t.startedAt, finishedAt: t.finishedAt });
}
