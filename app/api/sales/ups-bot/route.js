import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { runBot, sources } from "@/lib/upsBot";

export const maxDuration = 45;

// Daily safety run (Vercel cron). The bot also runs every few minutes while anyone in management has Modo open.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const authed = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed && !/vercel-cron/i.test(req.headers.get("user-agent") || "")) {
    const s = await currentUser(); if (!s) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const src = await sources();
    return NextResponse.json({ ups: !!src.ups, shippo: !!src.shippo, aftership: !!src.aftership });
  }
  return NextResponse.json(await runBot({ limit: 40, staleMin: 60 }));
}

// { id } → track one sale now. {} → the bot's regular round (stale packages only).
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.id) {
    if (s.role === "AGENT") { const x = await db.sale.findUnique({ where: { id: String(b.id) }, select: { userId: true } }); if (x?.userId !== s.uid) return NextResponse.json({ error: "Not allowed." }, { status: 403 }); }
    // Add / change / remove the package's tracking number
    if ("trackingNo" in b) {
      const n = String(b.trackingNo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 40);
      if (n && n.length < 8) return NextResponse.json({ error: "That doesn't look like a tracking number." }, { status: 400 });
      const carrier = !n ? null : /^1Z/.test(n) ? "ups" : /^(94|93|92|95)\d{18,20}$|^[A-Z]{2}\d{9}US$/.test(n) ? "usps" : /^\d{12}$|^\d{15}$/.test(n) ? "fedex" : "ups";
      await db.sale.update({ where: { id: String(b.id) }, data: { trackingNo: n || null, carrier, upsStatus: null, upsStage: null, upsEta: null, upsEvents: null, upsAt: null, upsError: null } });
      if (!n) return NextResponse.json({ ok: true, sale: { trackingNo: null } });
    }
    const r = await runBot({ id: String(b.id) });
    if (r.needsSetup && "trackingNo" in b) { const sale = await db.sale.findUnique({ where: { id: String(b.id) }, select: { trackingNo: true, carrier: true } }); return NextResponse.json({ ok: true, needsSetup: true, sale }); }
    if (r.needsSetup) return NextResponse.json({ error: "Connect UPS tracking in Connectors (UPS API, or your Shippo token) so the bot can read UPS scans." }, { status: 400 });
    const sale = await db.sale.findUnique({ where: { id: String(b.id) }, select: { trackingNo: true, carrier: true, returnTracking: true, upsStatus: true, upsStage: true, upsEta: true, upsEvents: true, upsAt: true, upsSrc: true, upsError: true, dropStore: true, deliveredAt: true } });
    return NextResponse.json({ ...r, sale });
  }
  if (s.role === "AGENT") return NextResponse.json({ ok: true, skipped: true });
  return NextResponse.json(await runBot({ limit: 10, staleMin: 20 }));
}
