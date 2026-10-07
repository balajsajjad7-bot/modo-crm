import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { scope, log, names } from "@/lib/crm";
import { can } from "@/lib/perms";

// ?view=open|today|overdue|done  &owner=
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams; const view = q.get("view") || "open";
  const where = { ...scope(s, "assigneeId", q.get("owner")) };
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  if (view === "done") where.done = true;
  else { where.done = false; if (view === "today") where.dueAt = { lte: endOfDay }; if (view === "overdue") where.dueAt = { lt: new Date() }; }
  const tasks = await db.task.findMany({ where, orderBy: view === "done" ? { doneAt: "desc" } : [{ dueAt: "asc" }, { createdAt: "asc" }], take: 500 });
  const contacts = await db.contact.findMany({ where: { id: { in: tasks.map((t) => t.contactId).filter(Boolean) } }, select: { id: true, name: true, phone: true } });
  const n = await names(tasks.map((t) => t.assigneeId));
  const counts = { overdue: await db.task.count({ where: { ...scope(s, "assigneeId", q.get("owner")), done: false, dueAt: { lt: new Date() } } }) };
  return NextResponse.json({ counts, tasks: tasks.map((t) => ({ ...t, assignee: n[t.assigneeId], contact: contacts.find((c) => c.id === t.contactId) || null })) });
}

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await can(s, "scheduleCallbacks"))) return NextResponse.json({ error: "Admin has turned this off for agents." }, { status: 403 });
  const b = await req.json();
  if (!String(b.title || "").trim()) return NextResponse.json({ error: "Give the task a title." }, { status: 400 });
  // Agents may only attach things to their own customers and deals.
  if (s.role !== "ADMIN") {
    if (b.contactId && (await db.contact.findUnique({ where: { id: String(b.contactId) }, select: { ownerId: true } }))?.ownerId !== s.uid) return NextResponse.json({ error: "That customer isn't yours." }, { status: 403 });
    if (b.dealId && (await db.deal.findUnique({ where: { id: String(b.dealId) }, select: { ownerId: true } }))?.ownerId !== s.uid) return NextResponse.json({ error: "That deal isn't yours." }, { status: 403 });
  }

  const t = await db.task.create({ data: {
    title: b.title.trim().slice(0, 200), type: ["callback", "task", "email", "meeting"].includes(b.type) ? b.type : "task",
    dueAt: b.dueAt ? new Date(b.dueAt) : null, contactId: b.contactId || null, dealId: b.dealId || null, notes: b.notes || null,
    assigneeId: s.role === "ADMIN" && b.assigneeId ? b.assigneeId : s.uid, createdById: s.uid,
  } });
  if (t.contactId) await log(s.uid, { contactId: t.contactId, dealId: t.dealId, kind: "task", text: `${s.name} scheduled ${t.type === "callback" ? "a callback" : "a task"}: ${t.title}${t.dueAt ? " · " + t.dueAt.toLocaleString() : ""}` });
  return NextResponse.json(t);
}
