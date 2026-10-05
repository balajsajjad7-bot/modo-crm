import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { dialerConfig, saveDialerConfig, ACTIONS, DEFAULT_DISPOS, DEFAULT_PAUSE, customStatus } from "@/lib/dialer";
import { publicView } from "@/lib/connectors";
import { enc } from "@/lib/crypto";

// Admin → Tools → Dialer setup (everything about the dialer on one page)
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const [cfg, vici, agents] = await Promise.all([
    dialerConfig(), db.connector.findFirst({ where: { type: "vicidial" }, orderBy: { createdAt: "desc" } }),
    db.user.findMany({ where: { role: { in: ["AGENT", "ADMIN"] } }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, agentId: true, role: true, vicidialUser: true, sipUser: true, sipPass: true, active: true } }),
  ]);
  const agentsOut = agents.map(({ sipPass, ...a }) => ({ ...a, sipPassSet: !!sipPass }));
  return NextResponse.json({ ...cfg, agents: agentsOut, webphone: { ...cfg.webphone, pass: cfg.webphone.pass ? "••••" + cfg.webphone.pass.slice(-2) : "" }, custom: { ...cfg.custom, key: cfg.custom.key ? "••••" + cfg.custom.key.slice(-4) : "" },
    dispositions: cfg.dispositions || DEFAULT_DISPOS, pauseCodes: cfg.pauseCodes || DEFAULT_PAUSE, actions: ACTIONS, vicidial: vici ? publicView(vici) : null, agents: agentsOut });
}
// { provider?, name?, agentsSeeDialer?, dispositions?, pauseCodes?, custom?, links?: [{id, user}], autoMatch?, testAgent? }
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  if (b.testAgent) {
    const cfg = await dialerConfig();
    try { return NextResponse.json({ test: await customStatus(cfg, b.testAgent) }); } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  }
  const clean = (list) => (Array.isArray(list) ? list.map((x) => ({ code: String(x.code || "").toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 12), label: String(x.label || x.code || "").slice(0, 40) })).filter((x) => x.code) : undefined);
  const patch = {};
  if (["vicidial", "custom", "off"].includes(b.provider)) patch.provider = b.provider;
  if ("name" in b) patch.name = String(b.name || "").slice(0, 40);
  if ("agentsSeeDialer" in b) patch.agentsSeeDialer = !!b.agentsSeeDialer;
  if (b.dispositions) patch.dispositions = clean(b.dispositions);
  if (b.pauseCodes) patch.pauseCodes = clean(b.pauseCodes);
  if (b.custom) patch.custom = b.custom;
  if (b.webphone) patch.webphone = { wss: String(b.webphone.wss || "").trim().slice(0, 200), domain: String(b.webphone.domain || "").trim().slice(0, 120), prefix: String(b.webphone.prefix ?? "").replace(/[^0-9*#]/g, "").slice(0, 6), autoAnswer: b.webphone.autoAnswer !== false, on: b.webphone.on !== false, pass: b.webphone.pass || "" };
  if (Object.keys(patch).length) await saveDialerConfig(patch);
  if (Array.isArray(b.links)) for (const l of b.links) {
    const data = { vicidialUser: String(l.user || "").trim().slice(0, 40) || null };
    if ("phone" in l) data.sipUser = String(l.phone || "").trim().slice(0, 40) || null;
    if (l.phonePass && !String(l.phonePass).startsWith("••••")) data.sipPass = enc(String(l.phonePass).slice(0, 80));
    if (l.phonePass === "") data.sipPass = null;
    await db.user.update({ where: { id: l.id }, data }).catch(() => {});
  }
  let matched = 0;
  if (b.autoMatch) { const empty = await db.user.findMany({ where: { role: "AGENT", OR: [{ vicidialUser: null }, { vicidialUser: "" }] } }); for (const u of empty) { await db.user.update({ where: { id: u.id }, data: { vicidialUser: u.agentId } }); matched++; } }
  return NextResponse.json({ ok: true, matched });
}
