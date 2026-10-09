import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireAdminOnly } from "@/lib/auth";
import { getAll, mrr, upsertSub, deleteSub, savePlans, setAgentPlan, DEFAULT_PLANS } from "@/lib/subs";

// Admin → Subscriptions: plans, customers, agents' plans, history.
export const maxDuration = 60;
const mainOnly = (s) => (s?.org ? NextResponse.json({ error: "Not available in a company workspace." }, { status: 403 }) : null);

export async function GET() {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  const no = mainOnly(session); if (no) return no;
  const v = await getAll();
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true } });
  const { listTenants, canProvision } = await import("@/lib/tenants");
  return NextResponse.json({ ...v, agents, mrr: mrr(v), defaults: DEFAULT_PLANS, tenants: await listTenants(), canProvision: canProvision() });
}
// { action: "save" | "delete" | "plans" | "agent" | "agentsAll", ... }
export async function POST(req) {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const no = mainOnly(session); if (no) return no;
  const b = await req.json().catch(() => ({}));
  const by = session.name || "Admin";
  if (b.action === "save") {
    const sub = await upsertSub(b.sub || {}, by);
    // The company's workspace follows its subscription: paused / cancelled → their logins stop; active / trial → open.
    if (sub.workspace && b.sub?.status) {
      const { setTenantStatus } = await import("@/lib/tenants");
      await setTenantStatus(sub.workspace, sub.status === "pending" ? "paused" : sub.status, sub.status === "trial" ? { trialEnds: sub.renewsAt } : sub.status === "active" ? { trialEnds: null } : {});
    }
    return NextResponse.json({ ok: true, sub });
  }
  if (b.action === "provision") {
    const v = await getAll(); const sub = v.subs.find((x) => x.id === b.id);
    if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    if (sub.workspace) return NextResponse.json({ error: "This customer already has a workspace: " + sub.workspace }, { status: 400 });
    const { provisionWorkspace } = await import("@/lib/tenants");
    try {
      const ws = await provisionWorkspace({ company: sub.company, contact: sub.contact, email: sub.email, phone: sub.phone, plan: sub.plan, seats: sub.seats, source: "admin" });
      await upsertSub({ id: sub.id, workspace: ws.org, status: ws.trialEnds ? "trial" : "active", ...(ws.trialEnds ? { renewsAt: ws.trialEnds } : {}) }, by);
      return NextResponse.json({ ok: true, workspace: { org: ws.org, loginPath: "/login?w=" + ws.org, users: ws.users } });
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  }
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
