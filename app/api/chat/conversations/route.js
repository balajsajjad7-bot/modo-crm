import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { ensureEveryone, userMap, activeHuddle, ONLINE_MS } from "@/lib/chat";
import { ensureTraining, lessonTitle } from "@/lib/training";
import { ensureCoach } from "@/lib/coach";
import { ensureUpsBot } from "@/lib/upsChatBot";

const coachPreview = (t) => { try { const d = JSON.parse(t); return d.pending ? "Reading " + (d.agent || "an agent") + "'s notepad..." : "Coaching: " + (d.all ? "all notepads" : d.agent || "notepad"); } catch { return "Coaching"; } };

// Sidebar data: my channels and direct messages, unread counts, presence and live calls.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await db.user.update({ where: { id: s.uid }, data: { lastSeenAt: new Date() } }).catch(() => {});
  await ensureEveryone();
  await ensureTraining().catch(() => {}); // #modo-training never blocks the chat list
  if (s.role === "ADMIN") { await ensureCoach().catch(() => {}); await ensureUpsBot().catch(() => {}); }
  const mine = await db.convMember.findMany({ where: { userId: s.uid }, select: { conversationId: true, lastReadAt: true } });
  const convs = await db.conversation.findMany({
    where: { id: { in: mine.map((m) => m.conversationId) } }, orderBy: { lastMessageAt: "desc" },
    include: { members: { select: { userId: true } }, messages: { where: { parentId: null, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const allIds = convs.flatMap((c) => c.members.map((m) => m.userId));
  const users = await db.user.findMany({ where: { id: { in: [...new Set(allIds)] } }, select: { id: true, name: true, agentId: true, role: true, lastSeenAt: true } });
  const U = Object.fromEntries(users.map((u) => [u.id, u]));
  const online = (id) => !!U[id]?.lastSeenAt && Date.now() - new Date(U[id].lastSeenAt) < ONLINE_MS;
  const readAt = Object.fromEntries(mine.map((m) => [m.conversationId, m.lastReadAt]));
  const meName = (s.name || "").toLowerCase();

  const out = await Promise.all(convs.map(async (c) => {
    const others = c.members.map((m) => m.userId).filter((id) => id !== s.uid);
    const unreadMsgs = await db.message.findMany({ where: { conversationId: c.id, createdAt: { gt: readAt[c.id] }, userId: { not: s.uid }, deletedAt: null, kind: { not: "SYSTEM" } }, select: { text: true } });
    const h = await activeHuddle(c.id);
    const last = c.messages[0];
    const kind = c.isChannel ? "channel" : c.isGroup ? "group" : "dm";
    return {
      id: c.id, kind, isGroup: c.isGroup, isChannel: c.isChannel, isPrivate: c.isPrivate, topic: c.topic,
      title: c.isChannel ? c.name : c.isGroup ? c.name : U[others[0]]?.name || "Direct message",
      online: kind === "dm" ? online(others[0]) : null,
      members: c.members.map((m) => ({ id: m.userId, name: U[m.userId]?.name || "Former user", role: U[m.userId]?.role, agentId: U[m.userId]?.agentId, online: online(m.userId) })),
      unread: unreadMsgs.length,
      mentions: unreadMsgs.filter((m) => meName && (m.text || "").toLowerCase().includes("@" + meName)).length,
      last: last ? { kind: last.kind, text: last.kind === "COACH" ? "🧠 " + coachPreview(last.text) : last.kind === "LESSON" ? "📘 " + lessonTitle(last.text) : last.kind === "AUDIO" ? "🎤 Voice note" : last.kind === "FILE" ? "📎 " + (last.fileName || "File") : last.text, at: last.createdAt, by: U[last.userId]?.name } : null,
      huddle: h ? { id: h.id, startedById: h.startedById, startedBy: U[h.startedById]?.name || (await userMap([h.startedById]))[h.startedById]?.name, count: h.participants.length, inIt: h.participants.some((p) => p.userId === s.uid) } : null,
    };
  }));
  return NextResponse.json({ me: s.uid, conversations: out });
}

// { channel: true, name, topic?, isPrivate?, userIds? }  create a #channel
// { userIds: [id] }                                      open a direct message
// { userIds: [...], name }                               create a group message
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json();
  const others = [...new Set(b.userIds || [])].filter((id) => id && id !== s.uid);
  if (others.length) {
    const valid = await db.user.count({ where: { id: { in: others }, active: true } });
    if (valid !== others.length) return NextResponse.json({ error: "Someone you picked isn't an active user." }, { status: 400 });
  }
  if (b.channel) {
    const name = String(b.name || "").toLowerCase().trim().replace(/^#/, "").replace(/[^a-z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 40);
    if (!name) return NextResponse.json({ error: "Give the channel a name." }, { status: 400 });
    const exists = await db.conversation.findFirst({ where: { isChannel: true, name } });
    if (exists) return NextResponse.json({ error: `#${name} already exists.` }, { status: 400 });
    const c = await db.conversation.create({ data: {
      isGroup: true, isChannel: true, isPrivate: !!b.isPrivate, name, topic: String(b.topic || "").slice(0, 200) || null, createdById: s.uid,
      members: { create: [s.uid, ...others].map((userId) => ({ userId })) },
    } });
    await db.message.create({ data: { conversationId: c.id, userId: "system", kind: "SYSTEM", text: `${s.name} created #${name}` } });
    return NextResponse.json({ id: c.id });
  }
  if (!others.length) return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });
  if (others.length === 1 && !b.name) {
    const dms = await db.conversation.findMany({ where: { isGroup: false, members: { some: { userId: s.uid } } }, include: { members: true } });
    const found = dms.find((c) => c.members.length === 2 && c.members.some((m) => m.userId === others[0]));
    if (found) return NextResponse.json({ id: found.id });
    const c = await db.conversation.create({ data: { isGroup: false, createdById: s.uid, members: { create: [{ userId: s.uid }, { userId: others[0] }] } } });
    return NextResponse.json({ id: c.id });
  }
  const name = String(b.name || "").trim().slice(0, 60) || "Group";
  const c = await db.conversation.create({ data: { isGroup: true, name, createdById: s.uid, members: { create: [s.uid, ...others].map((userId) => ({ userId })) } } });
  return NextResponse.json({ id: c.id });
}

// Edit a channel's name/topic, or add people: { id, topic?, addUserIds? }
export async function PATCH(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json();
  const c = await db.conversation.findUnique({ where: { id: b.id }, include: { members: true } });
  if (!c || !c.members.some((m) => m.userId === s.uid)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if ("topic" in b) {
    await db.conversation.update({ where: { id: c.id }, data: { topic: String(b.topic || "").slice(0, 200) || null } });
    await db.message.create({ data: { conversationId: c.id, userId: "system", kind: "SYSTEM", text: `${s.name} set the topic: ${b.topic || "(cleared)"}` } });
  }
  if (Array.isArray(b.addUserIds) && b.addUserIds.length && c.isGroup) {
    await db.convMember.createMany({ data: b.addUserIds.map((userId) => ({ conversationId: c.id, userId })), skipDuplicates: true });
    const names = await userMap(b.addUserIds);
    await db.message.create({ data: { conversationId: c.id, userId: "system", kind: "SYSTEM", text: `${s.name} added ${b.addUserIds.map((id) => names[id]?.name).filter(Boolean).join(", ")}` } });
  }
  return NextResponse.json({ ok: true });
}
