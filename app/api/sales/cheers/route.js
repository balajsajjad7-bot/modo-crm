import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// My sales that admin just approved (marked Active) and I haven't seen the congrats for yet.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ sales: [] });
  const since = new Date(Date.now() - 3 * 86400000);
  const sales = await db.sale.findMany({ where: { userId: s.uid, status: "VERIFIED", cheeredAt: null, activatedAt: { gt: since } }, orderBy: { activatedAt: "desc" }, take: 6,
    select: { id: true, orderNumber: true, customer: true, device: true, deviceColor: true, storage: true, deviceValue: true, billAfter: true, activatedAt: true } }).catch(() => []);
  const total = sales.length ? await db.sale.count({ where: { userId: s.uid, status: "VERIFIED", activatedAt: { gt: new Date(Date.now() - 86400000) } } }).catch(() => 0) : 0;
  return NextResponse.json({ name: s.name, sales, today: total });
}
// { ids } → seen
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { ids } = await req.json().catch(() => ({}));
  await db.sale.updateMany({ where: { userId: s.uid, id: { in: (ids || []).map(String) } }, data: { cheeredAt: new Date() } });
  return NextResponse.json({ ok: true });
}
