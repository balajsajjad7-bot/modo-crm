import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

async function own(id, s, allowAdmin) {
  const m = await db.message.findUnique({ where: { id } });
  if (!m || m.deletedAt || m.kind === "SYSTEM") return null;
  if (m.userId === s.uid || (allowAdmin && s.role === "ADMIN")) return m;
  return null;
}

// Edit your own message
export async function PATCH(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const m = await own(params.id, s, false);
  if (!m) return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  const { text } = await req.json();
  if (!String(text || "").trim()) return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  await db.message.update({ where: { id: m.id }, data: { text: String(text).trim().slice(0, 4000), editedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

// Delete your own message (admin can delete any)
export async function DELETE(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const m = await own(params.id, s, true);
  if (!m) return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
  await db.message.update({ where: { id: m.id }, data: { deletedAt: new Date(), text: null } });
  if (m.fileId) await db.fileBlob.deleteMany({ where: { id: m.fileId } });
  return NextResponse.json({ ok: true });
}
