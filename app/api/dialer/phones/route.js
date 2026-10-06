import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { enc } from "@/lib/crypto";
import { viciConnector, patchVici } from "@/lib/relay";
import { loggedInAgents } from "@/lib/vicidial";

export const maxDuration = 30;
// Dialer setup → Phones: the admin's listening phone + every agent's phone (for Listen / Whisper / Barge).
export async function GET() {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  const conn = await viciConnector();
  const users = await db.user.findMany({ where: { role: { in: ["AGENT", "ADMIN"] } }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, agentId: true, role: true, active: true, vicidialUser: true, sipUser: true, sipPass: true } });
  let live = null, liveError = null;
  try { live = (await loggedInAgents()).map((r) => ({ user: r.user || r.f0, status: r.status, campaign: r.campaign_id })); } catch (e) { liveError = e.message; }
  const me = users.find((u) => u.id === session.uid);
  return NextResponse.json({
    connected: !!conn,
    monitor: { login: conn?.cfg.monitorPhone || "", passSet: !!me?.sipPass, serverIp: conn?.cfg.serverIp || "" },
    agents: users.map(({ sipPass, ...u }) => ({ ...u, phonePassSet: !!sipPass, live: live?.find((l) => l.user && [u.vicidialUser, u.agentId].includes(l.user)) || null })),
    liveError,
  });
}
// { monitor: { login, pass, serverIp } } | { agent: { id, vicidialUser, phone, pass } } | { remove: id }
export async function POST(req) {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const clean = (v, n = 40) => String(v || "").trim().slice(0, n);
  if (b.monitor) {
    const conn = await viciConnector();
    if (!conn) return NextResponse.json({ error: "Connect VICIdial first (above)." }, { status: 400 });
    await patchVici(conn.id, { monitorPhone: clean(b.monitor.login), ...(b.monitor.serverIp !== undefined ? { serverIp: clean(b.monitor.serverIp, 60) } : {}) });
    // The admin's Modo phone signs in as this phone, so the listen call rings right inside Modo
    const data = { sipUser: clean(b.monitor.login) || null };
    if (b.monitor.pass) data.sipPass = enc(String(b.monitor.pass).slice(0, 80));
    await db.user.update({ where: { id: session.uid }, data }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  if (b.agent?.id) {
    const data = {};
    if ("vicidialUser" in b.agent) data.vicidialUser = clean(b.agent.vicidialUser) || null;
    if ("phone" in b.agent) data.sipUser = clean(b.agent.phone) || null;
    if (b.agent.pass) data.sipPass = enc(String(b.agent.pass).slice(0, 80));
    await db.user.update({ where: { id: String(b.agent.id) }, data });
    return NextResponse.json({ ok: true });
  }
  if (b.remove) { await db.user.update({ where: { id: String(b.remove) }, data: { sipUser: null, sipPass: null } }); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
}
