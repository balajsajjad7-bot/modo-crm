import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, supervisorHas } from "@/lib/auth";
import { feed, tag } from "@/lib/salesFeed";
import { UPS_LABEL } from "@/lib/upsBot";

const OK = ["label", "dropped_off", "in_transit", "out_for_delivery", "delivered", "exception", "returned"];

// Someone checked UPS themselves (tapped the step, pasted UPS's page, a screenshot, or the add-on/app read it)
// → save that as the package's status on the sale.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const status = String(b.status || "");
  if (!b.id || !OK.includes(status)) return NextResponse.json({ error: "Which sale and which step?" }, { status: 400 });
  const sale = await db.sale.findUnique({ where: { id: String(b.id) }, select: { id: true, userId: true, orderNumber: true, customer: true, receipt: true, upsStatus: true } });
  if (!sale) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  const mgr = s.role === "ADMIN" || (s.role === "SUPERVISOR" && supervisorHas(s, "sales"));
  if (!mgr && sale.userId !== s.uid) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const stage = String(b.stage || "").replace(/\s+/g, " ").trim().slice(0, 280);
  const data = { upsStatus: status, upsStage: stage || UPS_LABEL[status] || status, upsAt: new Date(), upsSrc: `Checked on UPS by ${s.name || "staff"}`, upsError: null };
  if (status === "delivered") data.deliveredAt = new Date();
  const up = await db.sale.update({ where: { id: sale.id }, data, select: { id: true, upsStatus: true, upsStage: true, upsAt: true, upsSrc: true, upsError: true, upsEvents: true, upsEta: true, deliveredAt: true, orderNumber: true } });
  if (status !== sale.upsStatus) await feed(`📦 ${tag(sale)} UPS: ${UPS_LABEL[status] || status}${stage ? " — " + stage.slice(0, 120) : ""} (checked by ${s.name})`).catch(() => {});
  return NextResponse.json({ ok: true, sale: up });
}
