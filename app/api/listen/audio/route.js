import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// Agent uploads a small audio chunk for an active listen; admin polls to fetch & play them.
// This relays voice through Modo's own server, so live listen works WITHOUT a TURN server.

// POST { id, seq, data(base64) } — agent only
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = await db.listenRequest.findUnique({ where: { id: b.id || "" } });
  if (!r || r.endedAt || r.agentId !== s.uid) return NextResponse.json({ ended: true });
  const data = String(b.data || "");
  if (!data) return NextResponse.json({ ok: true });
  await db.audioChunk.create({ data: { listenId: r.id, seq: Number(b.seq) || 0, data: data.slice(0, 400000) } }).catch(() => {});
  await db.audioChunk.deleteMany({ where: { listenId: r.id, createdAt: { lt: new Date(Date.now() - 25000) } } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

// GET ?id=&after= — admin pulls new chunks; also keeps the listen alive so the agent keeps sending.
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const id = q.get("id"); const after = Number(q.get("after") || -1);
  const r = await db.listenRequest.findUnique({ where: { id: id || "" } });
  if (!r || r.adminId !== s.uid) return NextResponse.json({ ended: true, chunks: [] });
  if (r.endedAt) return NextResponse.json({ ended: true, chunks: [] });
  await db.listenRequest.update({ where: { id: r.id }, data: { lastSeen: new Date() } }).catch(() => {});
  const rows = await db.audioChunk.findMany({ where: { listenId: r.id, seq: { gt: after } }, orderBy: { seq: "asc" }, take: 10 });
  return NextResponse.json({ ended: false, chunks: rows.map((c) => ({ seq: c.seq, data: c.data })) });
}
