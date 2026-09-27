import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await req.json();
  const r = await db.listenRequest.findUnique({ where: { id: id || "" } });
  if (r && (r.adminId === s.uid || r.agentId === s.uid)) {
    await db.listenRequest.update({ where: { id: r.id }, data: { endedAt: new Date() } });
    await db.signal.deleteMany({ where: { huddleId: r.id } });
  }
  return NextResponse.json({ ok: true });
}
