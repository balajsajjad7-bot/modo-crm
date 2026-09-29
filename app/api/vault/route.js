import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCeo } from "@/lib/auth";

// CEO-only. The server stores and returns ciphertext only — it never sees the passphrase or plaintext.
export async function GET() {
  const { error } = await requireCeo();
  if (error) return error;
  const msgs = await db.vaultMsg.findMany({ orderBy: { createdAt: "asc" }, take: 1000 });
  return NextResponse.json(msgs.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt })));
}

export async function POST(req) {
  const { error } = await requireCeo();
  if (error) return error;
  const { body } = await req.json();
  if (typeof body !== "string" || body.length < 8 || body.length > 200000) return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  const m = await db.vaultMsg.create({ data: { body } });
  return NextResponse.json({ id: m.id, createdAt: m.createdAt });
}

export async function DELETE(req) {
  const { error } = await requireCeo();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (id === "all") { await db.vaultMsg.deleteMany({}); return NextResponse.json({ ok: true }); }
  if (!id) return NextResponse.json({ error: "Which message?" }, { status: 400 });
  await db.vaultMsg.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
