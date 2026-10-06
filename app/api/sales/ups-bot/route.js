import { NextResponse } from "next/server";
import { feed, tag } from "@/lib/salesFeed";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { runBot, sources } from "@/lib/upsBot";

export const maxDuration = 45;

// Scheduled tick (Vercel cron daily + GitHub every 30 min, see .github/workflows/ups-bot.yml). Safe to call by anyone:
// it only refreshes packages not checked in the last 25 minutes and returns counts, never sale data.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const big = (secret && req.headers.get("authorization") === `Bearer ${secret}`) || /vercel-cron/i.test(req.headers.get("user-agent") || "");
  const r = await runBot({ limit: big ? 40 : 20, staleMin: 25 });
  return NextResponse.json({ ok: r.ok, checked: r.checked, changed: r.changed || 0, needsSetup: !!r.needsSetup });
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
      const prev = await db.sale.findUnique({ where: { id: String(b.id) }, select: { orderNumber: true, customer: true, receipt: true, trackingNo: true } });
      if (prev && prev.trackingNo !== (n || null)) await feed(n ? `🚚 ${tag(prev)} tracking ${prev.trackingNo ? "changed to" : "added:"} ${n} (by ${s.name}) — Modo bot is tracking it` : `🚚 ${tag(prev)} tracking number removed by ${s.name}`);
      await db.sale.update({ where: { id: String(b.id) }, data: { trackingNo: n || null, carrier, upsStatus: null, upsStage: null, upsEta: null, upsEvents: null, upsAt: null, upsError: null } });
      if (!n) return NextResponse.json({ ok: true, sale: { trackingNo: null } });
    }
    const r = await runBot({ id: String(b.id) });
    if (r.needsSetup && "trackingNo" in b) { const sale = await db.sale.findUnique({ where: { id: String(b.id) }, select: { trackingNo: true, carrier: true } }); return NextResponse.json({ ok: true, needsSetup: true, sale }); }
    if (r.needsSetup) return NextResponse.json({ error: r.shippoTest ? "Your Shippo key is a test key — it can't track real UPS packages. In Connectors → Return labels (Shippo), paste your Live token into “Live token for tracking”. Meanwhile, tap the step UPS shows on the line above." : "Connect UPS tracking in Connectors (UPS API, or your Shippo Live token) so the bot can read UPS scans. Meanwhile, tap the step UPS shows on the line above." }, { status: 400 });
    const sale = await db.sale.findUnique({ where: { id: String(b.id) }, select: { trackingNo: true, carrier: true, returnTracking: true, upsStatus: true, upsStage: true, upsEta: true, upsEvents: true, upsAt: true, upsSrc: true, upsError: true, dropStore: true, deliveredAt: true } });
    return NextResponse.json({ ...r, sale });
  }
  if (s.role === "AGENT") return NextResponse.json({ ok: true, skipped: true });
  return NextResponse.json(await runBot({ limit: 10, staleMin: 20 }));
}
