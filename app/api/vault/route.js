import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSecureLine } from "@/lib/auth";

// Shared Secure line room. Everyone the CEO invited can read/write; the server stores ciphertext only.
export async function GET() {
  const { error } = await requireSecureLine();
  if (error) return error;
  const msgs = await db.vaultMsg.findMany({ orderBy: { createdAt: "asc" }, take: 2000 });
  return NextResponse.json(msgs.map((m) => ({ id: m.id, body: m.body, userId: m.userId, senderName: m.senderName, createdAt: m.createdAt })));
}

export async function POST(req) {
  const { error, session } = await requireSecureLine();
  if (error) return error;
  const { body } = await req.json();
  if (typeof body !== "string" || body.length < 8 || body.length > 200000) return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  const m = await db.vaultMsg.create({ data: { body, userId: session.uid, senderName: session.name } });
  return NextResponse.json({ id: m.id, userId: m.userId, senderName: m.senderName, createdAt: m.createdAt });
}

export async function DELETE(req) {
  const { error, session, ceo } = await requireSecureLine();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (id === "all") { if (!ceo) return NextResponse.json({ error: "Only the CEO can clear the room." }, { status: 403 }); await db.vaultMsg.deleteMany({}); return NextResponse.json({ ok: true }); }
  if (!id) return NextResponse.json({ error: "Which message?" }, { status: 400 });
  const m = await db.vaultMsg.findUnique({ where: { id } });
  if (m && !ceo && m.userId !== session.uid) return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
  await db.vaultMsg.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
