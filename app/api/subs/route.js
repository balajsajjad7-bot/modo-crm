import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireAdminOnly } from "@/lib/auth";
import { getAll, mrr, upsertSub, deleteSub, savePlans, setAgentPlan, DEFAULT_PLANS } from "@/lib/subs";

// Admin → Subscriptions: plans, customers, agents' plans, history.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const v = await getAll();
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true } });
  return NextResponse.json({ ...v, agents, mrr: mrr(v), defaults: DEFAULT_PLANS });
}
// { action: "save" | "delete" | "plans" | "agent" | "agentsAll", ... }
export async function POST(req) {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const by = session.name || "Admin";
  if (b.action === "save") return NextResponse.json({ ok: true, sub: await upsertSub(b.sub || {}, by) });
  if (b.action === "delete") { await deleteSub(String(b.id || "")); return NextResponse.json({ ok: true }); }
  if (b.action === "plans") return NextResponse.json({ ok: true, plans: await savePlans(Array.isArray(b.plans) ? b.plans : []) });
  if (b.action === "agent") { await setAgentPlan(String(b.uid || ""), b.plan ? String(b.plan) : null); return NextResponse.json({ ok: true }); }
  if (b.action === "agentsAll") {
    const ids = (await db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true } })).map((u) => u.id);
    for (const id of ids) await setAgentPlan(id, b.plan ? String(b.plan) : null);
    return NextResponse.json({ ok: true, n: ids.length });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
