import { NextResponse } from "next/server";
import { feed, tag, money as usd } from "@/lib/salesFeed";
import { sendPush } from "@/lib/push";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireRole, clientIp } from "@/lib/auth";
import { resolveShift } from "@/lib/payroll";
import { emit } from "@/lib/connectors";
import { log } from "@/lib/crm";
import { returnConfig, makeLabel } from "@/lib/returnLabel";

const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const str = (v, n = 200) => (v == null || String(v).trim() === "" ? null : String(v).trim().slice(0, n));
const digits = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : null; };
const money = (n) => (n == null ? "—" : "$" + Number(n).toFixed(2));

// Plain-text copy of the sale (kept with the record, used by connectors and AI).
function asText(f, agent, closer) {
  return [
    `ORDER #${f.orderNumber || "—"}`,
    `Customer: ${f.customer || "—"} | Phone: ${f.phone || "—"} | Email: ${f.email || "—"}`,
    `Address: ${f.address || "—"} ${f.zip || ""}`,
    `Bill: ${money(f.billBefore)} → ${money(f.billAfter)} (${f.discountPct ?? "—"}% off) | Next bill: ${f.nextBillDate ? f.nextBillDate.toISOString().slice(0, 10) : "—"}`,
    `Lines: ${f.lines ?? "—"} | Overcharged: ${money(f.overcharged)}`,
    `Device: ${f.device || "—"} | Color: ${f.deviceColor || "—"} | Storage: ${f.storage || "—"} | Specs: ${f.specs || "—"} | Gift: ${f.gift || "—"}`,
    `Office: ${f.office || "—"} | Location code: ${f.locationCode || "—"} | Sent by: ${agent} | Closed by: ${closer}`,
    f.notes ? `Notes: ${f.notes}` : "",
  ].filter(Boolean).join("\n");
}

// Agent submits a structured sale. Agents can never read sales back.
export async function POST(req) {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const b = await req.json();
  const f = {
    customer: str(b.customer, 120), phone: str(b.phone, 40), email: str(b.email, 120), address: str(b.address, 240), zip: str(b.zip, 20),
    orderNumber: str(b.orderNumber, 60), discountPct: num(b.discountPct), billBefore: num(b.billBefore), billAfter: num(b.billAfter),
    nextBillDate: b.nextBillDate ? new Date(b.nextBillDate) : null, lines: b.lines === "" || b.lines == null ? null : parseInt(b.lines) || null,
    overcharged: num(b.overcharged), device: str(b.device, 120), deviceColor: str(b.deviceColor, 60), storage: str(b.storage, 40),
    specs: str(b.specs, 400), gift: str(b.gift, 200), office: str(b.office, 40), locationCode: str(b.locationCode, 40), notes: str(b.notes, 2000),
    saleType: b.saleType === "addon" ? "addon" : "new", campaignId: str(b.campaignId, 60),
    trackingNo: str(b.trackingNo, 60), carrier: str(b.carrier, 20),
  };
  if (!f.customer || !f.phone || !f.orderNumber) return NextResponse.json({ error: "Customer name, contact number and order number are required." }, { status: 400 });
  if (f.nextBillDate && isNaN(f.nextBillDate)) f.nextBillDate = null;
  if (f.billAfter == null && f.billBefore != null && f.discountPct != null) f.billAfter = +(f.billBefore * (1 - f.discountPct / 100)).toFixed(2);

  const user = await db.user.findUnique({ where: { id: session.uid } });
  const closer = b.closerId ? await db.user.findUnique({ where: { id: b.closerId } }) : user;
  const phone = digits(f.phone);

  const flags = [];
  if (!f.email) flags.push("missing email");
  if (!f.address) flags.push("missing address");
  if (f.billBefore == null) flags.push("missing current bill");
  if (f.billBefore != null && f.discountPct != null && f.billAfter != null && Math.abs(f.billBefore * (1 - f.discountPct / 100) - f.billAfter) > 0.5) flags.push("bill after discount doesn't match");
  // Same order number = real duplicate. Same customer phone = a repeat customer (fine for add-on devices).
  const sameOrder = await db.sale.findFirst({ where: { orderNumber: f.orderNumber, status: { not: "REJECTED" } } });
  if (sameOrder) flags.push(`order number already used (${sameOrder.receipt})`);
  const earlier = phone ? await db.sale.count({ where: { phone, status: { not: "REJECTED" } } }) : 0;
  if (earlier && f.saleType !== "addon") flags.push("customer already has a sale, check if this is an add-on");
  if (!earlier && f.saleType === "addon") flags.push("marked as add-on but no earlier sale found for this number");
  const dup = sameOrder;

  const receipt = "MS-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const product = [f.device, f.storage, f.deviceColor].filter(Boolean).join(" · ") || null;
  await db.sale.create({ data: {
    receipt, userId: user.id, ip: clientIp(), shiftDate: resolveShift(user).shiftDate,
    raw: asText(f, user.name, closer?.name || user.name), summary: null, customer: f.customer, product, amount: f.billAfter,
    phone, email: f.email, address: f.address, zip: f.zip, orderNumber: f.orderNumber, discountPct: f.discountPct, billBefore: f.billBefore, billAfter: f.billAfter,
    nextBillDate: f.nextBillDate, lines: f.lines, overcharged: f.overcharged, device: f.device, deviceColor: f.deviceColor, storage: f.storage, specs: f.specs,
    gift: f.gift, office: f.office, locationCode: f.locationCode, notes: f.notes, saleType: f.saleType, campaignId: f.campaignId || user.campaignId || null, trackingNo: f.trackingNo || null, carrier: f.carrier || null, closerId: closer?.id || user.id, flags: flags.join(", ") || null, duplicateOf: dup?.receipt || null,
  } });
  // Every sale puts the customer in the agent's Customers + Notepad (or updates the existing record)
  try {
    const d10 = phone;
    let contact = null;
    if (d10) { const near = await db.contact.findMany({ where: { phone: { contains: d10.slice(-4) } }, take: 50 }); contact = near.find((c) => String(c.phone || "").replace(/\D/g, "").endsWith(d10)) || null; }
    if (!contact) contact = await db.contact.create({ data: { name: f.customer, phone: f.phone, email: f.email, address: [f.address, f.zip].filter(Boolean).join(" ") || null, tags: "sale", source: "Sale", ownerId: user.id } });
    await log(user.id, { contactId: contact.id, kind: "note", text: `Sale submitted · order #${f.orderNumber}${product ? " · " + product : ""}${f.billAfter != null ? ` · $${f.billAfter}/mo` : ""}${f.notes ? "\n" + f.notes : ""}` });
  } catch {}
  await feed(`🆕 New sale #${f.orderNumber} · ${f.customer}${product ? " · " + product : ""}${f.billAfter != null ? ` · ${usd(f.billAfter)}/mo` : ""}${f.discountPct != null ? ` (${f.discountPct}% off)` : ""} · by ${user.name}${closer && closer.id !== user.id ? `, closed by ${closer.name}` : ""}${flags.length ? `\n⚠ ${flags.join(", ")}` : ""}`);
  await emit("sale.created", { order: f.orderNumber, receipt, customer: f.customer, device: product, billAfter: f.billAfter, discount: f.discountPct != null ? f.discountPct + "%" : null, office: f.office, sentBy: user.name, closedBy: closer?.name, flags: flags.join(", ") });
  return NextResponse.json({ receipt });
}

// Admin only
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const sales = await db.sale.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true, agentId: true } } } });
  const closers = await db.user.findMany({ where: { id: { in: sales.map((s) => s.closerId).filter(Boolean) } }, select: { id: true, name: true } });
  // Group each customer's sales (by phone) so admin sees "Sale 2 of 3" and which ones are active.
  const phones = [...new Set(sales.map((s) => s.phone).filter(Boolean))];
  const family = phones.length ? await db.sale.findMany({ where: { phone: { in: phones } }, orderBy: { createdAt: "asc" }, select: { id: true, phone: true, orderNumber: true, status: true, device: true, createdAt: true, billAfter: true } }) : [];
  return NextResponse.json(sales.map((s) => {
    const sib = s.phone ? family.filter((x) => x.phone === s.phone) : [];
    return { ...s, closer: closers.find((c) => c.id === s.closerId)?.name || s.user.name,
      seq: sib.length ? sib.findIndex((x) => x.id === s.id) + 1 : 1, seqTotal: sib.length || 1, siblings: sib.filter((x) => x.id !== s.id) };
  }));
}

// Admin deletes a sale permanently
export async function DELETE(req) {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which sale?" }, { status: 400 });
  const gone = await db.sale.delete({ where: { id } }).catch(() => null);
  if (gone) await feed(`🗑 ${tag(gone)} deleted by ${session.name}`);
  return NextResponse.json({ ok: true });
}

// Admin marks a sale Active (VERIFIED) or Not active (REJECTED), or back to NEW
export async function PATCH(req) {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  const { id, status } = await req.json();
  if (!["NEW", "VERIFIED", "REJECTED"].includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  const before = await db.sale.findUnique({ where: { id }, select: { status: true } });
  const turnedActive = status === "VERIFIED" && before?.status !== "VERIFIED";
  let s = await db.sale.update({ where: { id }, data: { status, ...(turnedActive ? { activatedAt: new Date(), cheeredAt: null } : {}) }, include: { user: { select: { name: true } } } });
  // Congrats: the agent gets a phone alert now and a celebration in Modo the next time it's open.
  if (turnedActive) {
    const first = String(s.user?.name || "").split(" ")[0];
    sendPush(s.userId, { title: `🎉 Congrats ${first}! Sale approved`, body: `Well done! #${s.orderNumber || s.receipt}${s.customer ? " for " + s.customer : ""}${s.device ? " (" + s.device + ")" : ""} is now Active.`, url: "/agent", tag: "cheer-" + s.id, urgent: true }).catch(() => {});
  }
  // Automatic return label: when a sale turns Active and "Make a label automatically" is on in Connectors.
  if (status === "VERIFIED" && !s.returnLabelUrl) {
    try {
      const cfg = await returnConfig();
      if (cfg?.auto) { const r = await makeLabel(s, { cfg }); if (r.sale) s = { ...s, ...r.sale }; }
    } catch {}
  }
  if (before?.status !== status) await feed(`${status === "VERIFIED" ? "✅" : status === "REJECTED" ? "❌" : "↩️"} ${tag(s)} → ${status === "VERIFIED" ? "Active" : status === "REJECTED" ? "Not active" : "New"} by ${session.name}${turnedActive ? ` · ${String(s.user?.name || "").split(" ")[0]} got a congrats 🎉` : ""}${s.returnLabelUrl && turnedActive ? " · return label made" : ""}`);
  await emit("sale.status", { order: s.orderNumber, receipt: s.receipt, status: status === "VERIFIED" ? "Active" : status === "REJECTED" ? "Not active" : "New", agent: s.user.name, customer: s.customer });
  return NextResponse.json(s);
}
