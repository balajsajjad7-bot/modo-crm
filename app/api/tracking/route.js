import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { track, trackingConfig } from "@/lib/tracking";

// Admin/supervisor: list sales that have a tracking number, with their latest status.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const cfg = await trackingConfig();
  const rows = await db.sale.findMany({
    where: { trackingNo: { not: null }, status: { not: "REJECTED" } },
    orderBy: { createdAt: "desc" }, take: 500,
    select: { id: true, receipt: true, customer: true, phone: true, orderNumber: true, trackingNo: true, carrier: true, trackStatus: true, trackStage: true, trackUpdatedAt: true, deliveredAt: true, createdAt: true, device: true, office: true, user: { select: { name: true } } },
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
  const where = b.id ? { id: b.id } : { trackingNo: { not: null }, status: { not: "REJECTED" }, OR: [{ trackStatus: null }, { trackStatus: { notIn: ["delivered", "returned"] } }] };
  const sales = await db.sale.findMany({ where, take: b.id ? 1 : 80, select: { id: true, trackingNo: true, carrier: true } });
  let ok = 0, fail = 0;
  for (const s of sales) {
    try {
      const r = await track(cfg.apiKey, s.trackingNo, s.carrier);
      await db.sale.update({ where: { id: s.id }, data: { trackStatus: r.status, trackStage: r.stage?.slice(0, 300) || null, trackUpdatedAt: new Date(), deliveredAt: r.deliveredAt ? new Date(r.deliveredAt) : null } });
      ok++;
    } catch (e) {
      await db.sale.update({ where: { id: s.id }, data: { trackStage: ("Could not track: " + e.message).slice(0, 300), trackUpdatedAt: new Date() } }).catch(() => {});
      fail++;
    }
  }
  return NextResponse.json({ ok, fail, checked: sales.length });
}
