import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { buildContract } from "@/lib/contract";

async function opts(departmentId, campaignId) {
  const st = await getSettings();
  const dep = departmentId ? await db.department.findUnique({ where: { id: departmentId }, select: { name: true } }).catch(() => null) : null;
  const camp = campaignId ? await db.campaign.findUnique({ where: { id: campaignId }, select: { name: true } }).catch(() => null) : null;
  return { companyName: st.companyName, currency: st.currency, bonusPerSale: st.bonusPerSale, dailyTarget: st.dailyTarget, departmentName: dep?.name, campaignName: camp?.name };
}

export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json().catch(() => ({}));

  // Bulk: generate and save for all agents (optionally only those without a contract yet).
  if (b.all) {
    const agents = await db.user.findMany({ where: { role: "AGENT", ...(b.onlyMissing ? { contract: null } : {}) } });
    let count = 0;
    for (const a of agents) {
      const o = await opts(a.departmentId, a.campaignId);
      await db.user.update({ where: { id: a.id }, data: { contract: buildContract(a, o) } });
      count++;
    }
    return NextResponse.json({ ok: true, count });
  }

  // Single preview from the form values (not saved — admin reviews, edits, then saves).
  const agent = { name: b.name, agentId: b.agentId, baseSalary: b.baseSalary, shiftStart: b.shiftStart, shiftHours: b.shiftHours, workDays: b.workDays };
  const contract = buildContract(agent, await opts(b.departmentId, b.campaignId));
  return NextResponse.json({ contract });
}
