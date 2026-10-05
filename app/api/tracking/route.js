import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { track, trackingConfig } from "@/lib/tracking";

// Admin/supervisor: list sales that have a tracking number, with their latest status.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const cfg = await trackingConfig();
  // Include old orders too: anything with a tracking number OR an order number (we track by whichever exists).
  const rows = await db.sale.findMany({
    where: { status: { not: "REJECTED" }, OR: [{ trackingNo: { not: null } }, { orderNumber: { not: null } }] },
    orderBy: { createdAt: "desc" }, take: 800,
    select: { id: true, receipt: true, customer: true, phone: true, zip: true, email: true, locationCode: true, orderNumber: true, trackingNo: true, carrier: true, trackStatus: true, trackStage: true, trackUpdatedAt: true, deliveredAt: true, createdAt: true, device: true, office: true, user: { select: { name: true } } },
  });
  return NextResponse.json({ configured: !!cfg, rows });
}

// Refresh statuses. { id } refreshes one; otherwise refreshes all that aren't delivered yet (or are stale).
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const cfg = await trackingConfig();
  if (!cfg) return NextResponse.json({ error: "Add your AfterShip API key in Connectors → Order tracking." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  // Refresh ones not yet delivered — new and old. Track by tracking number, or fall back to the order number.
  const where = b.id ? { id: b.id } : { status: { not: "REJECTED" }, OR: [{ trackingNo: { not: null } }, { orderNumber: { not: null } }], AND: [{ OR: [{ trackStatus: null }, { trackStatus: { notIn: ["delivered", "returned"] } }] }] };
  const sales = await db.sale.findMany({ where, orderBy: { createdAt: "desc" }, take: b.id ? 1 : 120, select: { id: true, trackingNo: true, orderNumber: true, carrier: true } });
  let ok = 0, fail = 0;
  for (const s of sales) {
    const number = s.trackingNo || s.orderNumber;
    if (!number) continue;
    // Carrier order numbers checked with "Check order" (Verizon/AT&T/T-Mobile) aren't shipping numbers — don't overwrite them.
    if (!s.trackingNo && ["verizon", "att", "tmobile"].includes(String(s.carrier || "").toLowerCase())) continue;
    try {
      const r = await track(cfg.apiKey, number, s.carrier);
      await db.sale.update({ where: { id: s.id }, data: { trackStatus: r.status, trackStage: r.stage?.slice(0, 300) || null, trackUpdatedAt: new Date(), deliveredAt: r.deliveredAt ? new Date(r.deliveredAt) : null } });
      ok++;
    } catch (e) {
      await db.sale.update({ where: { id: s.id }, data: { trackStage: ("Could not track: " + e.message).slice(0, 300), trackUpdatedAt: new Date() } }).catch(() => {});
      fail++;
    }
  }
  return NextResponse.json({ ok, fail, checked: sales.length });
}
