import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canTouch, log } from "@/lib/crm";

export async function PATCH(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const t = await db.task.findUnique({ where: { id: params.id } });
  if (!t || !canTouch(s, t, "assigneeId")) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const b = await req.json(); const data = {};
  if ("done" in b) { data.done = !!b.done; data.doneAt = b.done ? new Date() : null; }
  if ("title" in b) data.title = String(b.title).slice(0, 200) || t.title;
  if ("dueAt" in b) data.dueAt = b.dueAt ? new Date(b.dueAt) : null;
  if ("notes" in b) data.notes = b.notes || null;
  if (s.role === "ADMIN" && b.assigneeId) data.assigneeId = b.assigneeId;
  const u = await db.task.update({ where: { id: t.id }, data });
  if (b.done && t.contactId) await log(s.uid, { contactId: t.contactId, dealId: t.dealId, kind: "task", text: `${s.name} completed: ${t.title}` });
  return NextResponse.json(u);
}

export async function DELETE(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const t = await db.task.findUnique({ where: { id: params.id } });
  if (!t || !canTouch(s, t, "assigneeId")) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  await db.task.delete({ where: { id: t.id } });
  return NextResponse.json({ ok: true });
}
