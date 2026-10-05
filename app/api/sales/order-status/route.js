import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { ORDER_STATUSES, normalizeOrderStatus } from "@/lib/orderFill";

const NAMES = { verizon: "Verizon", att: "AT&T", tmobile: "T-Mobile" };

// Save a carrier order status read by the Modo Fill bookmark (or picked by hand) onto the sale.
// Admins, and supervisors with Sales access. Stored in the sale's tracking fields so it shows on
// the sale card and the Order tracking page.
export async function POST(req) {
  const { error } = await requireManager("sales");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const status = ORDER_STATUSES.find((x) => x.toLowerCase() === String(b.status || "").toLowerCase());
  if (!b.id || !status) return NextResponse.json({ error: "Which sale and which status?" }, { status: 400 });
  const sale = await db.sale.findUnique({ where: { id: String(b.id) }, select: { id: true, trackingNo: true, carrier: true } });
  if (!sale) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  const who = NAMES[b.carrier] || "Verizon";
  const note = String(b.note || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const norm = normalizeOrderStatus(status);
  const data = {
    trackStatus: norm, trackStage: `${who}: ${status}${note ? " — " + note : ""}`.slice(0, 300), trackUpdatedAt: new Date(),
    deliveredAt: norm === "delivered" ? new Date() : null,
    // Only label the carrier when there's no separate shipping tracking number (so AfterShip keeps working for those).
    ...(!sale.trackingNo ? { carrier: b.carrier && NAMES[b.carrier] ? b.carrier : "verizon" } : {}),
  };
  const updated = await db.sale.update({ where: { id: sale.id }, data, select: { id: true, trackStatus: true, trackStage: true, trackUpdatedAt: true, orderNumber: true, customer: true } });
  return NextResponse.json({ ok: true, sale: updated });
}
