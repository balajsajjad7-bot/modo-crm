import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { scope, log, names } from "@/lib/crm";
import { can, permsFor } from "@/lib/perms";

export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const term = (q.get("q") || "").trim();
  const where = { ...scope(s, "ownerId", q.get("owner")) };
  if (term) where.OR = ["name", "phone", "email", "city", "company", "tags"].map((f) => ({ [f]: { contains: term, mode: "insensitive" } }));
  if (q.get("tag")) where.tags = { contains: q.get("tag"), mode: "insensitive" };
  const list = await db.contact.findMany({ where, orderBy: { updatedAt: "desc" }, take: 500 });
  const ids = list.map((c) => c.id);
  const [deals, tasks] = await Promise.all([
    ids.length ? db.deal.groupBy({ by: ["contactId"], where: { contactId: { in: ids }, stage: { notIn: ["won", "lost"] } }, _sum: { value: true }, _count: { _all: true } }) : [],
    ids.length ? db.task.groupBy({ by: ["contactId"], where: { contactId: { in: ids }, done: false }, _count: { _all: true } }) : [],
  ]);
  const owners = await names(list.map((c) => c.ownerId));
  const p = await permsFor(s);
  if (!p.seeContactInfo) list.forEach((c) => { c.phone = c.phone ? "•••• " + String(c.phone).slice(-2) : null; c.email = null; c.address = null; });
  return NextResponse.json(list.map((c) => ({ ...c, owner: owners[c.ownerId],
    openDeals: deals.find((d) => d.contactId === c.id)?._count._all || 0, pipeline: deals.find((d) => d.contactId === c.id)?._sum.value || 0,
    openTasks: tasks.find((t) => t.contactId === c.id)?._count._all || 0 })));
}

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await can(s, "addCustomers"))) return NextResponse.json({ error: "Admin has turned this off for agents." }, { status: 403 });
  const b = await req.json();
  if (!String(b.name || "").trim()) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
  const digits = String(b.phone || "").replace(/\D/g, "");
  if (digits.length >= 10) {
    const dup = await db.contact.findFirst({ where: { phone: { contains: digits.slice(-10) } } });
    if (dup && !b.force) return NextResponse.json(s.role === "ADMIN" || dup.ownerId === s.uid ? { error: `A customer with this phone already exists: ${dup.name}.`, duplicateId: dup.id } : { error: "This phone number already belongs to another agent's customer. Ask your admin." }, { status: 409 });
  }
  const c = await db.contact.create({ data: {
    name: b.name.trim().slice(0, 120), phone: b.phone || null, email: b.email || null, address: b.address || null, city: b.city || null,
    company: b.company || null, tags: String(b.tags || "").slice(0, 200), source: b.source || null,
    ownerId: s.role === "ADMIN" && b.ownerId ? b.ownerId : s.uid,
  } });
  await log(s.uid, { contactId: c.id, kind: "created", text: `${s.name} added this customer` });
  return NextResponse.json(c);
}
