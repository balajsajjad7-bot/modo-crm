import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, requireRole } from "@/lib/auth";
import { hash, newCode, beforeShiftEnd, dm } from "@/lib/shiftEnd";
import { resolveShift } from "@/lib/payroll";

// Agent: my request for today.  Admin: pending requests + the last 2 days.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await db.shiftEndRequest.updateMany({ where: { status: "approved", expiresAt: { lt: new Date() } }, data: { status: "expired" } });
  if (s.role === "ADMIN") {
    const list = await db.shiftEndRequest.findMany({ where: { OR: [{ status: "pending" }, { createdAt: { gte: new Date(Date.now() - 2 * 86400000) } }] }, orderBy: { createdAt: "desc" }, take: 60 });
    const users = await db.user.findMany({ where: { id: { in: [...new Set(list.map((r) => r.userId))] } }, select: { id: true, name: true, agentId: true, shiftStart: true, shiftHours: true } });
    return NextResponse.json({ requests: list.map(({ codeHash, ...r }) => { const u = users.find((x) => x.id === r.userId); return { ...r, name: u?.name, agentId: u?.agentId, shiftEnd: u ? beforeShiftEnd(u, new Date(r.createdAt)).end : null }; }) });
  }
  const u = await db.user.findUnique({ where: { id: s.uid } });
  const { early, end, shiftDate } = beforeShiftEnd(u);
  const r = await db.shiftEndRequest.findFirst({ where: { userId: s.uid, shiftDate }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ early, shiftEnd: end, request: r ? (({ codeHash, ...x }) => x)(r) : null });
}

// Agent asks: { reason }
export async function POST(req) {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const { reason } = await req.json();
  if (String(reason || "").trim().length < 3) return NextResponse.json({ error: "Tell admin why you need to leave early." }, { status: 400 });
  const u = await db.user.findUnique({ where: { id: session.uid } });
  const { shiftDate } = resolveShift(u);
  const open = await db.shiftEndRequest.findFirst({ where: { userId: u.id, shiftDate, status: { in: ["pending", "approved"] } } });
  if (open) return NextResponse.json({ error: "You already have a request waiting." }, { status: 400 });
  const r = await db.shiftEndRequest.create({ data: { userId: u.id, shiftDate, reason: String(reason).trim().slice(0, 300) } });
  return NextResponse.json({ ok: true, id: r.id });
}

// Admin decides: { id, approve: true|false, note? }  → on approve a 6-digit code goes to the agent (chat message) and back to admin
export async function PATCH(req) {
  const { session, error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  const r = await db.shiftEndRequest.findUnique({ where: { id: b.id || "" } });
  if (!r || r.status !== "pending") return NextResponse.json({ error: "This request was already handled." }, { status: 400 });
  if (!b.approve) {
    await db.shiftEndRequest.update({ where: { id: r.id }, data: { status: "denied", decidedBy: session.name, decidedAt: new Date(), adminNote: b.note || null } });
    await dm(session.uid, r.userId, `❌ Your request to end your shift early was not approved.${b.note ? " " + b.note : ""}`).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  const code = newCode();
  await db.shiftEndRequest.update({ where: { id: r.id }, data: { status: "approved", codeHash: hash(code), expiresAt: new Date(Date.now() + 30 * 60000), decidedBy: session.name, decidedAt: new Date(), adminNote: b.note || null } });
  await dm(session.uid, r.userId, `✅ Early shift end approved. Your code is ${code} — enter it in Modo (menu → End shift) within 30 minutes.${b.note ? " " + b.note : ""}`).catch(() => {});
  return NextResponse.json({ ok: true, code });
}
