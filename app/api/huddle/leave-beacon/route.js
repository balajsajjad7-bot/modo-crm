import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
// Sent by the browser when a tab closes mid-call, so others see you leave right away.
export async function POST(req) {
  const s = await currentUser();
  const id = new URL(req.url).searchParams.get("id");
  if (s && id) await db.huddleParticipant.updateMany({ where: { huddleId: id, userId: s.uid, leftAt: null }, data: { leftAt: new Date() } });
  return NextResponse.json({ ok: true });
}
