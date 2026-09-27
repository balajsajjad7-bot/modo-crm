import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, requireRole } from "@/lib/auth";
import { enc, dec } from "@/lib/crypto";
import { SERVICES, STATUSES, newConsumerId, digits, discountPct, ageOn } from "@/lib/budgetease";
import { emit } from "@/lib/connectors";

const MAX_PCT = 35; // Budget Ease offers up to 35% off
function shape(r, users, isAdmin) {
  const dob = dec(r.dob) || "";
  return { id: r.id, consumerId: r.consumerId, userId: r.userId, agent: users.find((u) => u.id === r.userId)?.name || "Former agent",
    customer: r.customer, phone: r.phone, email: r.email, zip: r.zip, serviceAddress: r.serviceAddress, company: r.company, service: r.service,
    billAmount: r.billAmount, payAmount: r.payAmount, discountPct: discountPct(r.billAmount, r.payAmount), savingsMonthly: Math.max(0, +(r.billAmount - r.payAmount).toFixed(2)),
    notes: r.notes, status: r.status, flags: r.flags ? r.flags.split("|") : [], createdAt: r.createdAt, updatedAt: r.updatedAt,
    ssn4: "••••", dobMasked: dob ? `••/••/${dob.slice(0, 4)}` : "—", age: dob ? ageOn(dob) : null, revealed: isAdmin ? JSON.parse(r.audit || "[]").length : undefined };
}

// Admin: everything (filters). Agent: their own submissions.
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams; const where = {};
  if (s.role !== "ADMIN") where.userId = s.uid; else if (q.get("agent")) where.userId = q.get("agent");
  if (q.get("from")) where.createdAt = { gte: new Date(q.get("from")) };
  const rows = await db.beSale.findMany({ where, orderBy: { createdAt: "desc" }, take: 1000 });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  return NextResponse.json(rows.map((r) => shape(r, users, s.role === "ADMIN")));
}

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json();
  const f = {
    customer: String(b.customer || "").trim().slice(0, 100), phone: digits(b.phone).slice(-10), email: String(b.email || "").trim().slice(0, 120) || null,
    ssn4: digits(b.ssn4), dob: String(b.dob || "").slice(0, 10), zip: digits(b.zip).slice(0, 5), serviceAddress: String(b.serviceAddress || "").trim().slice(0, 200),
    company: String(b.company || "").trim().slice(0, 100), service: SERVICES.includes(b.service) ? b.service : "other",
    billAmount: Number(b.billAmount), payAmount: Number(b.payAmount), notes: String(b.notes || "").trim().slice(0, 3000) || null,
  };
  const bad = [];
  if (!f.customer) bad.push("customer name");
  if (f.phone.length !== 10) bad.push("10-digit phone number");
  if (f.ssn4.length !== 4) bad.push("last 4 of SSN (4 digits)");
  const age = ageOn(f.dob); if (age == null) bad.push("date of birth"); else if (age < 18 || age > 110) bad.push("a date of birth for someone 18 or older");
  if (f.zip.length !== 5) bad.push("5-digit ZIP code");
  if (!f.serviceAddress) bad.push("service address");
  if (!f.company) bad.push("utility company");
  if (!(f.billAmount > 0)) bad.push("current bill amount");
  if (!(f.payAmount > 0)) bad.push("amount the customer wants to pay");
  if (bad.length) return NextResponse.json({ error: "Please add: " + bad.join(", ") + "." }, { status: 400 });
  if (f.payAmount >= f.billAmount) return NextResponse.json({ error: "What the customer wants to pay must be less than their current bill." }, { status: 400 });
  const flags = [];
  const pct = discountPct(f.billAmount, f.payAmount);
  if (pct > MAX_PCT) flags.push(`Asks for ${pct}% off (max is ${MAX_PCT}%)`);
  const dup = await db.beSale.findFirst({ where: { phone: f.phone, service: f.service }, select: { consumerId: true } });
  if (dup) flags.push(`Same phone and service as ${dup.consumerId}`);
  if (f.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.email)) flags.push("Email looks wrong");
  const me = await db.user.findUnique({ where: { id: s.uid }, select: { campaignId: true, name: true } });
  let consumerId = newConsumerId(); for (let i = 0; i < 5 && (await db.beSale.findUnique({ where: { consumerId } })); i++) consumerId = newConsumerId();
  const r = await db.beSale.create({ data: { ...f, ssn4: enc(f.ssn4), dob: enc(f.dob), consumerId, userId: s.uid, campaignId: me?.campaignId || null, flags: flags.join("|") || null } });
  await emit("sale.created", { text: `💡 Budget Ease: ${f.customer} · ${f.company} ${f.service} · $${f.billAmount} → $${f.payAmount} (${pct}% off) · ${consumerId} · by ${me?.name}` }).catch(() => {});
  return NextResponse.json({ id: r.id, consumerId, discountPct: pct, flags });
}

// Admin: { id, status?, notes? }
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json(); const data = {};
  if (b.status) { if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 }); data.status = b.status; }
  if ("notes" in b) data.notes = String(b.notes || "").slice(0, 3000) || null;
  await db.beSale.update({ where: { id: b.id }, data });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  await db.beSale.delete({ where: { id: id || "" } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
