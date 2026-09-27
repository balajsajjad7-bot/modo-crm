import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { clearKnowledgeCache, askAI } from "@/lib/ai";

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  let k = {}; try { k = JSON.parse((await getSettings()).aiKnowledge || "{}"); } catch {}
  return NextResponse.json(k);
}
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  if (b.tryIt) { // ask the AI a question using the saved knowledge
    try { return NextResponse.json({ answer: await askAI("You are Modo AI helping a call-center agent. Answer briefly and only with approved company info when it applies.", String(b.tryIt).slice(0, 800), { maxTokens: 500 }) }); }
    catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  }
  const k = { enabled: b.enabled !== false, company: String(b.company || "").slice(0, 4000), prices: String(b.prices || "").slice(0, 3000), script: String(b.script || "").slice(0, 4000),
    objections: (Array.isArray(b.objections) ? b.objections : []).slice(0, 40).map((o) => ({ q: String(o.q || "").slice(0, 200), a: String(o.a || "").slice(0, 600) })), rules: String(b.rules || "").slice(0, 3000), words: String(b.words || "").slice(0, 2000), updatedAt: new Date().toISOString() };
  await db.setting.update({ where: { id: "global" }, data: { aiKnowledge: JSON.stringify(k) } });
  clearKnowledgeCache();
  return NextResponse.json({ ok: true });
}
