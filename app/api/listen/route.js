import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

// Admin: start listening to a live call. { callSessionId }
export async function POST(req) {
  const { session, error } = await requireRole("ADMIN");
  if (error) return error;
  const { callSessionId } = await req.json();
  const c = await db.callSession.findUnique({ where: { id: callSessionId || "" } });
  if (!c || c.endedAt) return NextResponse.json({ error: "That call has ended." }, { status: 404 });
  await db.listenRequest.updateMany({ where: { callSessionId: c.id, adminId: session.uid, endedAt: null }, data: { endedAt: new Date() } });
  const r = await db.listenRequest.create({ data: { callSessionId: c.id, adminId: session.uid, agentId: c.userId } });
  return NextResponse.json({ id: r.id, agentId: c.userId });
}

// Agent's browser asks: is anyone waiting to listen to my call?
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const since = new Date(Date.now() - 20000);
  const list = await db.listenRequest.findMany({ where: { agentId: s.uid, endedAt: null, lastSeen: { gte: since } } });
  const st = await getSettings();
  return NextResponse.json({ requests: list.map((r) => ({ id: r.id, callSessionId: r.callSessionId })), notice: !!st.monitorNotice });
}
