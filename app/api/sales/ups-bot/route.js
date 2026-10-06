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
    const r = await runBot({ id: String(b.id) });
    if (r.needsSetup) return NextResponse.json({ error: "Connect UPS tracking in Connectors (UPS API, or your Shippo token) so the bot can read UPS scans." }, { status: 400 });
    const sale = await db.sale.findUnique({ where: { id: String(b.id) }, select: { upsStatus: true, upsStage: true, upsEta: true, upsEvents: true, upsAt: true, upsSrc: true, upsError: true, dropStore: true, deliveredAt: true } });
    return NextResponse.json({ ...r, sale });
  }
  if (s.role === "AGENT") return NextResponse.json({ ok: true, skipped: true });
  return NextResponse.json(await runBot({ limit: 10, staleMin: 20 }));
}
