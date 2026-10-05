import { NextResponse } from "next/server";
import { viciConnector, patchVici, sameKey } from "@/lib/relay";
import { clearHold } from "@/lib/vicidial";

// Called by the Modo Relay program on the office PC every few minutes: { key, url }
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const conn = await viciConnector();
  if (!conn || !sameKey(b.key, conn.cfg.relayKey)) return NextResponse.json({ error: "Unknown relay key. Download a fresh relay from Modo → Dialer setup." }, { status: 401 });
  const url = String(b.url || "");
  if (!/^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|onrender\.com)$/i.test(url)) return NextResponse.json({ error: "Bad tunnel address." }, { status: 400 });
  const hosts = new Set();
  for (const u of [conn.cfg.url, conn.cfg.portal, conn.cfg.agentUrl]) { try { if (u) hosts.add(new URL(u).hostname); } catch {} }
  const changed = url !== conn.cfg.relayUrl;
  await patchVici(conn.id, { relayUrl: url, relayAt: new Date().toISOString(), relayKind: b.kind === "cloud" ? "cloud" : "office" });
  if (changed) clearHold();
  return NextResponse.json({ ok: true, hosts: [...hosts] });
}
