import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

async function load(s, id) {
  const r = await db.listenRequest.findUnique({ where: { id: id || "" } });
  if (!r || (r.adminId !== s.uid && r.agentId !== s.uid)) return null;
  return r;
}
// WebRTC signalling between the admin who listens and the agent's browser. { id, type, payload }
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json();
  const r = await load(s, b.id);
  if (!r || r.endedAt) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!["offer", "answer", "ice", "meta"].includes(b.type)) return NextResponse.json({ error: "Bad signal." }, { status: 400 });
  const to = s.uid === r.adminId ? r.agentId : r.adminId;
  await db.signal.create({ data: { huddleId: r.id, fromId: s.uid, toId: to, type: b.type, payload: JSON.stringify(b.payload ?? null).slice(0, 20000) } });
  return NextResponse.json({ ok: true });
}
// ?id=  → my signals (and keeps the admin's side alive)
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  const r = await load(s, id);
  if (!r) return NextResponse.json({ ended: true });
  if (s.uid === r.adminId && !r.endedAt) await db.listenRequest.update({ where: { id: r.id }, data: { lastSeen: new Date() } });
  let callEnded = false;
  if (r.callSessionId) { const call = await db.callSession.findUnique({ where: { id: r.callSessionId }, select: { endedAt: true } }); callEnded = !!call?.endedAt; }
  const ended = !!r.endedAt || callEnded || (s.uid === r.agentId && Date.now() - new Date(r.lastSeen) > 20000);
  const sig = await db.signal.findMany({ where: { huddleId: r.id, toId: s.uid }, orderBy: { createdAt: "asc" } });
  if (sig.length) await db.signal.deleteMany({ where: { id: { in: sig.map((x) => x.id) } } });
  return NextResponse.json({ ended, signals: sig.map((x) => ({ type: x.type, payload: JSON.parse(x.payload) })) });
}
