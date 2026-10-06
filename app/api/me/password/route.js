import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdminOnly } from "@/lib/auth";

// Admin changes their own password inside Modo: { current, next }. Kept across deploys.
export async function POST(req) {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const { current, next } = await req.json().catch(() => ({}));
  const pw = String(next || "");
  if (pw.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return NextResponse.json({ error: "Use letters and at least one number." }, { status: 400 });
  const u = await db.user.findUnique({ where: { id: session.uid }, select: { passwordHash: true } });
  if (!u || !(await bcrypt.compare(String(current || ""), u.passwordHash))) return NextResponse.json({ error: "Your current password is wrong." }, { status: 401 });
  if (await bcrypt.compare(pw, u.passwordHash)) return NextResponse.json({ error: "That's the same as your current password." }, { status: 400 });
  await db.user.update({ where: { id: session.uid }, data: { passwordHash: await bcrypt.hash(pw, 10) } });
  return NextResponse.json({ ok: true });
}
