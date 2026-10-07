import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { scope, log, names, STAGES } from "@/lib/crm";
import { can } from "@/lib/perms";

export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const where = { ...scope(s, "ownerId", q.get("owner")) };
  if (q.get("contact")) where.contactId = q.get("contact");
  const deals = await db.deal.findMany({ where, orderBy: [{ position: "asc" }, { updatedAt: "desc" }], take: 1000 });
  const contacts = await db.contact.findMany({ where: { id: { in: deals.map((d) => d.contactId).filter(Boolean) } }, select: { id: true, name: true, phone: true } });
  const n = await names(deals.map((d) => d.ownerId));
  return NextResponse.json({ stages: STAGES, deals: deals.map((d) => ({ ...d, owner: n[d.ownerId], contact: contacts.find((c) => c.id === d.contactId) || null })) });
}

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await can(s, "deals"))) return NextResponse.json({ error: "Admin has turned this off for agents." }, { status: 403 });
  const b = await req.json();
  // Agents may only attach things to their own customers and deals.
  if (s.role !== "ADMIN") {
    if (b.contactId && (await db.contact.findUnique({ where: { id: String(b.contactId) }, select: { ownerId: true } }))?.ownerId !== s.uid) return NextResponse.json({ error: "That customer isn't yours." }, { status: 403 });
    if (b.dealId && (await db.deal.findUnique({ where: { id: String(b.dealId) }, select: { ownerId: true } }))?.ownerId !== s.uid) return NextResponse.json({ error: "That deal isn't yours." }, { status: 403 });
  }
  let contactId = b.contactId || null;
  if (!contactId && b.newContact?.name) {
    const c = await db.contact.create({ data: { name: b.newContact.name.slice(0, 120), phone: b.newContact.phone || null, email: b.newContact.email || null, ownerId: s.uid, source: "Pipeline" } });
    contactId = c.id;
  }
  const title = String(b.title || "").trim() || (b.service ? `${b.service} discount` : "New deal");
  const d = await db.deal.create({ data: {
    title: title.slice(0, 120), contactId, ownerId: s.role === "ADMIN" && b.ownerId ? b.ownerId : s.uid,
    stage: STAGES.some((x) => x.id === b.stage) ? b.stage : "lead", value: Number(b.value) || 0, service: b.service || null,
    expectedClose: b.expectedClose ? new Date(b.expectedClose) : null, position: Date.now(),
  } });
  await log(s.uid, { contactId, dealId: d.id, kind: "created", text: `${s.name} created deal "${d.title}"` });
  return NextResponse.json(d);
}
