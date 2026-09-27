import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// Download good calls (QA score ≥ min) as a JSONL training file (chat format: customer = user, agent = assistant).
// Ready for fine-tuning a model later.
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const min = Number(new URL(req.url).searchParams.get("min")) || 80;
  const good = await db.qaReview.findMany({ where: { overall: { gte: min } }, orderBy: { createdAt: "desc" }, take: 1000, select: { callSessionId: true } });
  const calls = await db.callSession.findMany({ where: { id: { in: good.map((g) => g.callSessionId) }, customerSide: true }, select: { transcript: true } });
  const lines = [];
  for (const c of calls) {
    const msgs = [{ role: "system", content: "You are a friendly, honest call-center sales agent." }];
    for (const l of c.transcript.split("\n").filter(Boolean)) {
      const role = l.startsWith("C: ") ? "user" : "assistant"; const content = l.replace(/^[AC]: /, "").trim(); if (!content) continue;
      const last = msgs[msgs.length - 1]; if (last.role === role) last.content += " " + content; else msgs.push({ role, content });
    }
    if (msgs.length >= 4 && msgs.some((m) => m.role === "user")) lines.push(JSON.stringify({ messages: msgs }));
  }
  return new Response(lines.join("\n") + (lines.length ? "\n" : ""), { headers: { "content-type": "application/jsonl", "content-disposition": `attachment; filename="modo-training-${new Date().toISOString().slice(0, 10)}.jsonl"` } });
}
