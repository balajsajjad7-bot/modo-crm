import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { returnConfig, makeLabel } from "@/lib/returnLabel";

export const maxDuration = 60;

// Is Shippo set up? (so the sale card knows whether to offer "Make label")
export async function GET() {
  const { error } = await requireManager("sales");
  if (error) return error;
  const cfg = await returnConfig();
  return NextResponse.json(cfg ? { ready: true, auto: cfg.auto, carrier: cfg.carrier, test: cfg.test, to: cfg.to } : { ready: false });
}

// Make (or remake with { again: true }) a prepaid return label for a sale; { email: true } re-sends it.
export async function POST(req) {
  const { error } = await requireManager("sales");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const sale = b.id ? await db.sale.findUnique({ where: { id: String(b.id) } }) : null;
  if (!sale) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  const res = await makeLabel(sale, { again: !!b.again, emailOnly: !!b.email });
  return NextResponse.json(res, { status: res.error ? 400 : 200 });
}
