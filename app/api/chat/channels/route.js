import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { TRAINING_ID } from "@/lib/training";

// Browse public channels, and join or leave them.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const list = await db.conversation.findMany({ where: { isChannel: true, isPrivate: false }, orderBy: { name: "asc" }, include: { members: { select: { userId: true } } } });
  return NextResponse.json(list.map((c) => ({ id: c.id, name: c.name, topic: c.topic, count: c.members.length, joined: c.members.some((m) => m.userId === s.uid) })));
}

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id, action } = await req.json();
  const c = await db.conversation.findUnique({ where: { id } });
  if (!c || !c.isChannel) return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  if (action === "join") {
    if (c.isPrivate) return NextResponse.json({ error: "This channel is private." }, { status: 403 });
    await db.convMember.upsert({ where: { conversationId_userId: { conversationId: id, userId: s.uid } }, update: {}, create: { conversationId: id, userId: s.uid } });
    await db.message.create({ data: { conversationId: id, userId: "system", kind: "SYSTEM", text: `${s.name} joined #${c.name}` } });
  } else if (action === "leave") {
    if (id === "everyone") return NextResponse.json({ error: "Everyone stays in #general." }, { status: 400 });
    if (id === TRAINING_ID) return NextResponse.json({ error: "Everyone stays in #modo-training." }, { status: 400 });
    await db.convMember.deleteMany({ where: { conversationId: id, userId: s.uid } });
    await db.message.create({ data: { conversationId: id, userId: "system", kind: "SYSTEM", text: `${s.name} left #${c.name}` } });
  }
  return NextResponse.json({ ok: true });
}
