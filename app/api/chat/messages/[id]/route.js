import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { cleanLesson } from "@/lib/training";

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
  const b = await req.json();
  // Lessons in #modo-training: any admin can edit them.
  if (b.lesson) {
    if (s.role !== "ADMIN") return NextResponse.json({ error: "Only admins can edit lessons." }, { status: 403 });
    const lm = await db.message.findUnique({ where: { id: params.id } });
    if (!lm || lm.deletedAt || lm.kind !== "LESSON") return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    let prev = {}; try { prev = JSON.parse(lm.text || "{}"); } catch {}
    const l = cleanLesson({ kind: prev.kind, provider: prev.provider, key: prev.key, ...b.lesson });
    if (!l) return NextResponse.json({ error: "Give the lesson a title and some content." }, { status: 400 });
    await db.message.update({ where: { id: lm.id }, data: { text: JSON.stringify(l), editedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  const m = await own(params.id, s, false);
  if (!m) return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  const { text } = b;
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
  await db.message.update({ where: { id: m.id }, data: { deletedAt: new Date(), ...(m.kind === "LESSON" ? {} : { text: null }) } }); // lessons keep their text hidden so a deleted built-in lesson isn't seeded again
  if (m.fileId) await db.fileBlob.deleteMany({ where: { id: m.fileId } });
  return NextResponse.json({ ok: true });
}
