import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember, MAX_FILE, shapeAll } from "@/lib/chat";
import { sendPush } from "@/lib/push";

// ?c=<conversation>  [&thread=<parent id>]  [&since=<ISO>]  (since = anything created or changed after)
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const c = q.get("c"), thread = q.get("thread");
  if (!c || !(await isMember(c, s.uid))) return NextResponse.json({ error: "You're not in this conversation." }, { status: 403 });
  const where = thread ? { conversationId: c, OR: [{ id: thread }, { parentId: thread }] } : { conversationId: c, parentId: null };
  const list = thread
    ? await db.message.findMany({ where, orderBy: { createdAt: "asc" }, take: 300 })
    : (await db.message.findMany({ where, orderBy: { createdAt: "desc" }, take: 150 })).reverse();
  if (!thread) await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: new Date() } });
  return NextResponse.json(await shapeAll(list, s.uid));
}

// multipart form: c, text?, parentId?, file? (voice=1 for a voice note)
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await req.formData();
  const c = String(form.get("c") || "");
  if (!c || !(await isMember(c, s.uid))) return NextResponse.json({ error: "You're not in this conversation." }, { status: 403 });
  const text = String(form.get("text") || "").trim().slice(0, 4000);
  const parentId = String(form.get("parentId") || "") || null;
  if (parentId) {
    const p = await db.message.findUnique({ where: { id: parentId } });
    if (!p || p.conversationId !== c || p.parentId) return NextResponse.json({ error: "Can't reply to that message." }, { status: 400 });
  }
  const file = form.get("file");
  const voice = form.get("voice") === "1";
  let data = { conversationId: c, userId: s.uid, kind: "TEXT", text: text || null, parentId };
  if (file && typeof file === "object" && file.size) {
    if (file.size > MAX_FILE) return NextResponse.json({ error: "Files can be up to 4 MB." }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const name = (file.name || (voice ? "voice-note.webm" : "file")).slice(0, 120);
    const mime = file.type || "application/octet-stream";
    const blob = await db.fileBlob.create({ data: { userId: s.uid, name, mime, size: file.size, data: buf } });
    data = { ...data, kind: voice ? "AUDIO" : "FILE", fileId: blob.id, fileName: name, fileMime: mime, fileSize: file.size };
  } else if (!text) {
    return NextResponse.json({ error: "Type a message or attach something." }, { status: 400 });
  }
  const m = await db.message.create({ data });
  if (!parentId) await db.conversation.update({ where: { id: c }, data: { lastMessageAt: m.createdAt } });
  await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: m.createdAt } });
  // Push the other people in this conversation (best-effort; reaches locked phones).
  try {
    const conv = await db.conversation.findUnique({ where: { id: c }, select: { name: true, isChannel: true } });
    const preview = data.kind === "AUDIO" ? "🎤 Voice note" : data.kind === "FILE" ? "📎 " + (data.fileName || "File") : (text || "").slice(0, 120);
    const title = conv?.isChannel ? `#${conv.name || "channel"} · ${s.name}` : s.name;
    const others = (await db.convMember.findMany({ where: { conversationId: c, userId: { not: s.uid } }, select: { userId: true } })).map((x) => x.userId);
    if (others.length) sendPush(others, { title, body: preview, url: "/", tag: "chat-" + c });
  } catch {}
  return NextResponse.json((await shapeAll([m], s.uid))[0]);
}
