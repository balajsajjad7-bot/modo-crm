import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember, userMap, activeHuddle, endHuddle, systemMessage, ACTIVE_MS } from "@/lib/chat";
import { emit } from "@/lib/connectors";

// Heartbeat + state for a call I'm in: participants and signalling messages addressed to me.
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  const h = id && await db.huddle.findUnique({ where: { id } });
  if (!h || !(await isMember(h.conversationId, s.uid))) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  if (h.endedAt) return NextResponse.json({ ended: true });
  await db.huddleParticipant.updateMany({ where: { huddleId: id, userId: s.uid, leftAt: null }, data: { lastSeen: new Date() } });
  const since = new Date(Date.now() - ACTIVE_MS);
  const parts = await db.huddleParticipant.findMany({ where: { huddleId: id, leftAt: null, lastSeen: { gte: since } } });
  const signals = await db.signal.findMany({ where: { huddleId: id, toId: s.uid }, orderBy: { createdAt: "asc" } });
  if (signals.length) await db.signal.deleteMany({ where: { id: { in: signals.map((x) => x.id) } } });
  const users = await userMap(parts.map((p) => p.userId));
  return NextResponse.json({
    ended: false, conversationId: h.conversationId, startedById: h.startedById, startedAt: h.startedAt,
    participants: parts.map((p) => ({ id: p.userId, name: users[p.userId]?.name || "Someone", muted: p.muted })),
    signals: signals.map((x) => ({ from: x.fromId, type: x.type, payload: JSON.parse(x.payload) })),
  });
}

// { action: "start", conversationId } | { action: "join" | "leave" | "end" | "mute", huddleId, muted? }
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json();

  if (b.action === "start") {
    if (s.role !== "ADMIN") return NextResponse.json({ error: "Only admin can start a call." }, { status: 403 });
    if (!(await isMember(b.conversationId, s.uid))) return NextResponse.json({ error: "You're not in this conversation." }, { status: 403 });
    let h = await activeHuddle(b.conversationId);
    if (!h) {
      h = await db.huddle.create({ data: { conversationId: b.conversationId, startedById: s.uid } });
      const c = await db.conversation.findUnique({ where: { id: b.conversationId } });
      await systemMessage(b.conversationId, `${s.name} started a ${c.isGroup ? "huddle" : "call"}`);
      await emit("huddle.started", { by: s.name, where: c.isChannel ? "#" + c.name : c.isGroup ? c.name : "direct call" });
    }
    await db.huddleParticipant.upsert({ where: { huddleId_userId: { huddleId: h.id, userId: s.uid } }, update: { leftAt: null, lastSeen: new Date() }, create: { huddleId: h.id, userId: s.uid } });
    return NextResponse.json({ huddleId: h.id });
  }

  const h = b.huddleId && await db.huddle.findUnique({ where: { id: b.huddleId } });
  if (!h || h.endedAt) return NextResponse.json({ error: "This call has ended." }, { status: 404 });
  if (!(await isMember(h.conversationId, s.uid))) return NextResponse.json({ error: "You're not in this conversation." }, { status: 403 });

  if (b.action === "join") {
    await db.huddleParticipant.upsert({ where: { huddleId_userId: { huddleId: h.id, userId: s.uid } }, update: { leftAt: null, lastSeen: new Date(), muted: false }, create: { huddleId: h.id, userId: s.uid } });
    await db.signal.deleteMany({ where: { huddleId: h.id, OR: [{ toId: s.uid }, { fromId: s.uid }] } }); // fresh start
    return NextResponse.json({ huddleId: h.id });
  }
  if (b.action === "mute") {
    await db.huddleParticipant.updateMany({ where: { huddleId: h.id, userId: s.uid }, data: { muted: !!b.muted } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "leave") {
    await db.huddleParticipant.updateMany({ where: { huddleId: h.id, userId: s.uid }, data: { leftAt: new Date() } });
    await db.signal.deleteMany({ where: { huddleId: h.id, OR: [{ toId: s.uid }, { fromId: s.uid }] } });
    const left = await db.huddleParticipant.count({ where: { huddleId: h.id, leftAt: null, lastSeen: { gte: new Date(Date.now() - ACTIVE_MS) } } });
    if (!left) await endHuddle(h.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "end") {
    if (s.role !== "ADMIN") return NextResponse.json({ error: "Only admin can end the call for everyone." }, { status: 403 });
    await endHuddle(h.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
