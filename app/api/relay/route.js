import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { viciConnector, ensureRelayKey, relayOnline, relayFetch } from "@/lib/relay";

// Admin: relay status. POST { action: "newkey" } makes a new key (old relays stop working); { action: "test" } pings it.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const conn = await viciConnector();
  if (!conn) return NextResponse.json({ setup: "Save the VICIdial connection first." });
  return NextResponse.json({ online: relayOnline(conn.cfg), url: conn.cfg.relayUrl || "", lastSeen: conn.cfg.relayAt || null, hasKey: !!conn.cfg.relayKey });
}
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const conn = await viciConnector();
  if (!conn) return NextResponse.json({ error: "Save the VICIdial connection first." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "newkey") { await ensureRelayKey(conn, true); return NextResponse.json({ ok: true }); }
  if (b.action === "test") {
    if (!relayOnline(conn.cfg)) return NextResponse.json({ error: "The relay isn't running. Start Modo Relay on the office PC." }, { status: 400 });
    try {
      const t = Date.now();
      const r = await relayFetch({ url: conn.cfg.relayUrl, key: conn.cfg.relayKey }, new URL("/vicidial/non_agent_api.php?function=version", conn.cfg.url), { timeout: 15000 });
      return NextResponse.json({ ok: true, ms: Date.now() - t, status: r.status, text: (await r.text()).slice(0, 160) });
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
