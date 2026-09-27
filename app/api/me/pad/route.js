import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
// Personal scratchpad (only the owner can read it)
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const u = await db.user.findUnique({ where: { id: s.uid }, select: { padText: true } });
  return NextResponse.json({ text: u?.padText || "" });
}
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { text } = await req.json();
  await db.user.update({ where: { id: s.uid }, data: { padText: String(text || "").slice(0, 50000) } });
  return NextResponse.json({ ok: true, at: new Date() });
}
