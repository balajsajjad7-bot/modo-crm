import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { returnConfig, makeLabel, quoteRates } from "@/lib/returnLabel";

export const maxDuration = 60;

// Is Shippo set up? (so the sale card knows whether to offer "Make label")
export async function GET() {
  const { error } = await requireManager("sales");
  if (error) return error;
  const cfg = await returnConfig();
  return NextResponse.json(cfg ? { ready: true, auto: cfg.auto, carrier: cfg.carrier, test: cfg.test, to: cfg.to } : { ready: false });
}

// { quote: true } → prices. { rateId } → buy that label (or remake with again: true). { email: true } re-sends it.
export async function POST(req) {
  const { error } = await requireManager("sales");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const sale = b.id ? await db.sale.findUnique({ where: { id: String(b.id) } }) : null;
  if (!sale) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  // Step 1 (checkout): prices only, nothing charged
  if (b.quote) {
    try { return NextResponse.json(await quoteRates(sale)); }
    catch (e) { await db.sale.update({ where: { id: sale.id }, data: { returnError: e.message.slice(0, 300) } }).catch(() => {}); return NextResponse.json({ error: e.message }, { status: 400 }); }
  }
  // Step 2: buy the chosen price (Shippo charges the saved card) — or the cheapest if no rateId
  const res = await makeLabel(sale, { again: !!b.again, emailOnly: !!b.email, rateId: b.rateId ? String(b.rateId) : undefined });
  return NextResponse.json(res, { status: res.error ? 400 : 200 });
}
