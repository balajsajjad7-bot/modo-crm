import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { permsFor } from "@/lib/perms";
import { db } from "@/lib/db";
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const u = await db.user.findUnique({ where: { id: s.uid }, select: { status: true, departmentId: true, campaignId: true, totpEnabled: true, ceo: true, secureLine: true, supAccess: true } }).catch(() => null);
  let supAccess = []; try { supAccess = JSON.parse(u?.supAccess || "[]"); } catch {}
  let dialerOn = true; try { const dc = JSON.parse((await db.setting.findUnique({ where: { id: "global" }, select: { dialer: true } }))?.dialer || "{}"); dialerOn = dc.provider !== "off" && dc.agentsSeeDialer !== false; } catch {}
  const camp = u?.campaignId ? await db.campaign.findUnique({ where: { id: u.campaignId }, select: { name: true } }).catch(() => null) : null;
  return NextResponse.json({ uid: s.uid, role: s.role, name: s.name, agentId: s.agentId, perms: await permsFor(s), status: u?.status || "available", departmentId: u?.departmentId, campaignId: u?.campaignId, campaignName: camp?.name || null, budgetEase: /budget\s*ease/i.test(camp?.name || ""), dialerOn, desktop: false, twoStep: !!u?.totpEnabled, ceo: !!u?.ceo, secureLine: !!u?.secureLine, supAccess, workspace: s.org || null });
}
