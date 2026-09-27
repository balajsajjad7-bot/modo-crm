import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// Agents edit or delete their own notes; admin can fix anyone's.
async function own(s, id) {
  const a = await db.crmActivity.findUnique({ where: { id } });
  if (!a || !["note", "call"].includes(a.kind)) return null;
  return a.userId === s.uid || s.role === "ADMIN" ? a : null;
}
export async function PATCH(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const a = await own(s, params.id);
  if (!a) return NextResponse.json({ error: "You can only edit your own notes." }, { status: 403 });
  const { text } = await req.json();
  if (!String(text || "").trim()) return NextResponse.json({ error: "Note can't be empty." }, { status: 400 });
  await db.crmActivity.update({ where: { id: a.id }, data: { text: String(text).trim().slice(0, 2000) } });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const a = await own(s, params.id);
  if (!a) return NextResponse.json({ error: "You can only delete your own notes." }, { status: 403 });
  await db.crmActivity.delete({ where: { id: a.id } });
  return NextResponse.json({ ok: true });
}
