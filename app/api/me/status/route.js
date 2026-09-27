import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
// Agent sets their own status: available | away | busy
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { status } = await req.json();
  if (!["available", "away", "busy"].includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  await db.user.update({ where: { id: s.uid }, data: { status, statusAt: new Date() } });
  return NextResponse.json({ ok: true, status });
}
