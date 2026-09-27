import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canTouch, log, names } from "@/lib/crm";
import { can, permsFor } from "@/lib/perms";

async function load(s, id) {
  const c = await db.contact.findUnique({ where: { id } });
  return c && canTouch(s, c) ? c : null;
}

export async function GET(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const c = await load(s, params.id);
  if (!c) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const [deals, tasks, activity] = await Promise.all([
    db.deal.findMany({ where: { contactId: c.id }, orderBy: { createdAt: "desc" } }),
    db.task.findMany({ where: { contactId: c.id }, orderBy: [{ done: "asc" }, { dueAt: "asc" }] }),
    db.crmActivity.findMany({ where: { contactId: c.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const n = await names([c.ownerId, ...activity.map((a) => a.userId), ...tasks.map((t) => t.assigneeId)]);
  if (!(await permsFor(s)).seeContactInfo) { c.phone = c.phone ? "•••• " + String(c.phone).slice(-2) : null; c.email = null; c.address = null; }
  return NextResponse.json({ contact: { ...c, owner: n[c.ownerId] }, deals, tasks: tasks.map((t) => ({ ...t, assignee: n[t.assigneeId] })), activity: activity.map((a) => ({ ...a, by: n[a.userId] })) });
}

export async function PATCH(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const c = await load(s, params.id);
  if (!c) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  if (!(await can(s, "editCustomers"))) return NextResponse.json({ error: "Admin has turned this off for agents." }, { status: 403 });
  const b = await req.json(); const data = {};
  for (const k of ["name", "phone", "email", "address", "city", "company", "tags", "source"]) if (k in b) data[k] = b[k] === "" ? null : String(b[k]).slice(0, 200);
  if (data.tags === null) data.tags = "";
  if ("name" in data && !data.name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
  if (s.role === "ADMIN" && b.ownerId && b.ownerId !== c.ownerId) {
    data.ownerId = b.ownerId;
    const n = await names([b.ownerId]);
    await log(s.uid, { contactId: c.id, kind: "note", text: `${s.name} reassigned this customer to ${n[b.ownerId]}` });
  }
  return NextResponse.json(await db.contact.update({ where: { id: c.id }, data }));
}

export async function DELETE(req, { params }) {
  const s = await currentUser();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Only admin can delete customers." }, { status: 403 });
  await db.$transaction([
    db.crmActivity.deleteMany({ where: { contactId: params.id } }),
    db.task.deleteMany({ where: { contactId: params.id } }),
    db.deal.updateMany({ where: { contactId: params.id }, data: { contactId: null } }),
    db.contact.delete({ where: { id: params.id } }),
  ]).catch(() => {});
  return NextResponse.json({ ok: true });
}
