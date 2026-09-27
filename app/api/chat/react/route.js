import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember, EMOJIS } from "@/lib/chat";

// Toggle an emoji reaction on a message
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { messageId, emoji } = await req.json();
  if (!EMOJIS.includes(emoji)) return NextResponse.json({ error: "Unknown emoji." }, { status: 400 });
  const m = await db.message.findUnique({ where: { id: messageId } });
  if (!m || !(await isMember(m.conversationId, s.uid))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const key = { messageId_userId_emoji: { messageId, userId: s.uid, emoji } };
  const had = await db.reaction.findUnique({ where: key });
  if (had) await db.reaction.delete({ where: key });
  else await db.reaction.create({ data: { messageId, userId: s.uid, emoji } });
  return NextResponse.json({ ok: true, on: !had });
}
