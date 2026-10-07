import { NextResponse } from "next/server";
import { requireAdminOnly } from "@/lib/auth";
import { waBlocked } from "@/lib/waLock";
import { getStatus, setStatus, getSettings, saveSettings, relayCall, relayTarget, wipeAuth } from "@/lib/walink";
import { viciConnector, relayOnline, ensureRelayKey } from "@/lib/relay";

// Admin: Modo WhatsApp (linked number) status, QR, settings, pairing code and unlink.
export async function GET() {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const lk = await waBlocked(session); if (lk) return NextResponse.json(lk.body, { status: lk.status });
  const conn = await viciConnector();
  const st = await getStatus();
  const fresh = st.at && Date.now() - new Date(st.at) < 2 * 60000;
  return NextResponse.json({
    status: { ...st, qr: st.state === "qr" && fresh ? st.qr : "", pairCode: st.pairCode && st.pairAt && Date.now() - new Date(st.pairAt) < 3 * 60000 ? st.pairCode : "" },
    settings: await getSettings(),
    relay: conn ? { online: relayOnline(conn.cfg), kind: conn.cfg.relayKind || "", key: session?.role === "ADMIN" ? await ensureRelayKey(conn) : "" } : null,
  });
}
export async function POST(req) {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const lk = await waBlocked(session); if (lk) return NextResponse.json(lk.body, { status: lk.status });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "settings") {
      const admins = String(b.admins || "").split(/[\s,;]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 8).join(", ");
      return NextResponse.json({ ok: true, settings: await saveSettings({ admins, ...(b.aiReply ? { aiReply: b.aiReply === "off" ? "off" : "on", mode: b.aiReply === "off" ? "off" : "ask" } : {}) }) });
    }
    if (b.action === "pair") {
      const n = String(b.number || "").replace(/\D/g, "");
      if (n.length < 8) return NextResponse.json({ error: "Type the WhatsApp number with country code, e.g. 923001234567." }, { status: 400 });
      const d = await relayCall("/wa/pair", { number: n });
      if (d.code) await setStatus({ pairCode: d.code, pairAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, code: d.code || "", pending: !!d.pending });
    }
    if (b.action === "logout") {
      try { await relayCall("/wa/logout"); } catch {}
      await wipeAuth(); await setStatus({ state: "logged_out", me: "", qr: "" });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "diagnose") return NextResponse.json({ ok: true, relay: await relayCall("/wa/status") });
    if (b.action === "restart") { await relayCall("/wa/restart", { fresh: !!b.fresh }); if (b.fresh) await setStatus({ state: "starting", qr: "", error: "" }); return NextResponse.json({ ok: true }); }
    if (b.action === "refresh") {
      const t = await relayTarget();
      if (t) await fetch(t.url + "/ping", { signal: AbortSignal.timeout(8000) }).catch(() => {});
      return NextResponse.json({ ok: true });
    }
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
