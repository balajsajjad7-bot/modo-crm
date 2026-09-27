import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// The Budget Ease campaign (created if missing)
async function beCampaign() {
  const all = await db.campaign.findMany();
  return all.find((c) => /budget\s*ease/i.test(c.name)) || db.campaign.create({ data: { name: "Budget Ease", color: "#ffb347" } });
}
// Admin: every agent and whether they're on Budget Ease
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const c = await beCampaign();
  const [agents, camps] = await Promise.all([db.user.findMany({ where: { role: "AGENT" }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true, active: true, campaignId: true } }), db.campaign.findMany()]);
  return NextResponse.json({ campaignId: c.id, agents: agents.map((a) => ({ ...a, on: a.campaignId === c.id, other: a.campaignId && a.campaignId !== c.id ? camps.find((x) => x.id === a.campaignId)?.name : null })) });
}
// { userIds: [...], on: true|false }  — moving an agent onto Budget Ease takes them off their other campaign
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json(); const c = await beCampaign();
  const ids = Array.isArray(b.userIds) ? b.userIds : [b.userId].filter(Boolean);
  if (b.on) await db.user.updateMany({ where: { id: { in: ids }, role: "AGENT" }, data: { campaignId: c.id } });
  else await db.user.updateMany({ where: { id: { in: ids }, role: "AGENT", campaignId: c.id }, data: { campaignId: null } });
  return NextResponse.json({ ok: true });
}
