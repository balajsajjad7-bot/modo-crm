import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { slipsFor } from "@/lib/month";
import { resolveShift, breakSeconds } from "@/lib/payroll";

// Full agent profile for admin
export async function GET(req, { params }) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const month = new URL(req.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const u = await db.user.findUnique({ where: { id: params.id } });
  if (!u || u.role !== "AGENT") return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const { passwordHash, totpSecret, ...user } = u;
  const [[slip], attendance, sales, notes, calls, breaksToday] = await Promise.all([
    slipsFor([u], month),
    db.attendance.findMany({ where: { userId: u.id }, orderBy: { shiftDate: "desc" }, take: 60 }),
    db.sale.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, receipt: true, customer: true, product: true, amount: true, status: true, createdAt: true, flags: true } }),
    db.agentNote.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.callSession.findMany({ where: { userId: u.id, score: { not: null } }, orderBy: { startedAt: "desc" }, take: 20, select: { id: true, score: true, startedAt: true, tone: true } }),
    db.breakLog.findMany({ where: { userId: u.id, shiftDate: resolveShift(u).shiftDate } }),
  ]);
  const authors = await db.user.findMany({ where: { id: { in: notes.map((n) => n.byId) } }, select: { id: true, name: true } });
  const today = attendance.find((a) => a.shiftDate === resolveShift(u).shiftDate) || null;
  const online = !!u.lastSeenAt && Date.now() - new Date(u.lastSeenAt) < 60000;
  return NextResponse.json({
    user, online, today, onBreak: breaksToday.some((b) => !b.end), breakUsed: breaksToday.reduce((t, b) => t + breakSeconds(b), 0),
    slip: slip.slip, attendance, sales, calls,
    notes: notes.map((n) => ({ ...n, by: authors.find((a) => a.id === n.byId)?.name || "Admin" })),
    stats: { sales: sales.length, verified: sales.filter((s) => s.status === "VERIFIED").length, avgScore: calls.length ? Math.round(calls.reduce((t, c) => t + c.score, 0) / calls.length) : null },
  });
}

// Edit any detail
export async function PATCH(req, { params }) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  const data = {};
  for (const k of ["name", "email", "phone", "cnic", "vicidialUser", "shiftStart", "workDays", "departmentId", "campaignId"]) if (k in b) data[k] = b[k] || null;
  if ("contract" in b) data.contract = String(b.contract || "").slice(0, 20000) || null;
  for (const k of ["baseSalary", "shiftHours", "graceMinutes"]) if (k in b) data[k] = Number(b[k]) || 0;
  if ("active" in b) data.active = !!b.active;
  if (b.password) {
    if (String(b.password).length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    data.passwordHash = await bcrypt.hash(b.password, 10);
  }
  if (!data.shiftStart) delete data.shiftStart;
  if (!data.workDays) delete data.workDays;
  if ("name" in data && !data.name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
  await db.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

// Actions: { action: "note", text } | { action: "adjust", amount, reason, month } | { action: "deleteAdjust", id }
//          { action: "deleteNote", id } | { action: "clockOut" } | { action: "endBreak" } | { action: "resetToday" }
export async function POST(req, { params }) {
  const { session, error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  const u = await db.user.findUnique({ where: { id: params.id } });
  if (!u) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const now = new Date(); const shiftDate = resolveShift(u).shiftDate;
  switch (b.action) {
    case "note":
      if (!String(b.text || "").trim()) return NextResponse.json({ error: "Write a note first." }, { status: 400 });
      await db.agentNote.create({ data: { userId: u.id, text: String(b.text).trim().slice(0, 2000), byId: session.uid } }); break;
    case "deleteNote": await db.agentNote.deleteMany({ where: { id: b.id, userId: u.id } }); break;
    case "adjust": {
      const amount = Number(b.amount);
      if (!amount || !String(b.reason || "").trim()) return NextResponse.json({ error: "Enter an amount (use minus for a deduction) and a reason." }, { status: 400 });
      await db.adjustment.create({ data: { userId: u.id, month: b.month || now.toISOString().slice(0, 7), amount, reason: String(b.reason).trim().slice(0, 200), createdById: session.uid } }); break;
    }
    case "deleteAdjust": await db.adjustment.deleteMany({ where: { id: b.id, userId: u.id } }); break;
    case "dock": {
      const amount = Math.abs(Number(b.amount) || 0);
      const reason = String(b.reason || "").trim();
      if (!amount && !b.warning) return NextResponse.json({ error: "Dock some pay, log a warning, or both." }, { status: 400 });
      if (!reason) return NextResponse.json({ error: "Add a reason." }, { status: 400 });
      if (amount) await db.adjustment.create({ data: { userId: u.id, month: b.month || now.toISOString().slice(0, 7), amount: -amount, reason: "Dock: " + reason, createdById: session.uid } });
      if (b.warning) {
        await db.agentNote.create({ data: { userId: u.id, text: `⚠ Warning by ${session.name}: ${reason}${amount ? ` (pay docked ${amount})` : ""}`, byId: session.uid } });
        try { const { sendPush } = await import("@/lib/push"); await sendPush(u.id, { title: "⚠ Warning from management", body: reason + (amount ? ` — pay docked ${amount}.` : ""), urgent: true, url: "/agent" }); } catch {}
      }
      return NextResponse.json({ ok: true, docked: amount, warned: !!b.warning });
    }
    case "clockOut":
      await db.breakLog.updateMany({ where: { userId: u.id, end: null }, data: { end: now } });
      await db.attendance.updateMany({ where: { userId: u.id, shiftDate, clockOut: null }, data: { clockOut: now } }); break;
    case "endBreak": await db.breakLog.updateMany({ where: { userId: u.id, end: null }, data: { end: now } }); break;
    case "resetToday": // e.g. agent signed in by mistake; removes today's attendance so it isn't counted
      await db.attendance.deleteMany({ where: { userId: u.id, shiftDate } }); break;
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
