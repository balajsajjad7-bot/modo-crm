import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// WebRTC signalling (offer / answer / ICE candidate) between two people in the same call.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { huddleId, to, type, payload } = await req.json();
  if (!["offer", "answer", "ice"].includes(type)) return NextResponse.json({ error: "Bad signal." }, { status: 400 });
  const both = await db.huddleParticipant.count({ where: { huddleId, userId: { in: [s.uid, to] }, leftAt: null } });
  if (both !== 2) return NextResponse.json({ error: "Not in this call." }, { status: 403 });
  await db.signal.create({ data: { huddleId, fromId: s.uid, toId: to, type, payload: JSON.stringify(payload).slice(0, 20000) } });
  return NextResponse.json({ ok: true });
}
