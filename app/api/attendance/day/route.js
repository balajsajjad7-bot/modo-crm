import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireManager } from "@/lib/auth";
import { lateness } from "@/lib/payroll";

// Admin: everyone's attendance for one shift date, and manual corrections.
export async function GET(req) {
  const { error } = await requireManager("attendance");
  if (error) return error;
  const date = new URL(req.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const agents = await db.user.findMany({ where: { role: "AGENT" }, orderBy: { name: "asc" } });
  const att = await db.attendance.findMany({ where: { shiftDate: date } });
  return NextResponse.json(agents.map((u) => ({ id: u.id, name: u.name, agentId: u.agentId, shiftStart: u.shiftStart, active: u.active, record: att.find((a) => a.userId === u.id) || null })));
}

// { userId, date, clockIn: ISO, clockOut?: ISO|null }  → create or fix a record (lateness recalculated)
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  const u = await db.user.findUnique({ where: { id: b.userId } });
  if (!u) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const inAt = new Date(b.clockIn);
  if (isNaN(inAt)) return NextResponse.json({ error: "Enter a valid clock-in time." }, { status: 400 });
  const outAt = b.clockOut ? new Date(b.clockOut) : null;
  if (outAt && (isNaN(outAt) || outAt <= inAt)) return NextResponse.json({ error: "Clock-out must be after clock-in." }, { status: 400 });
  const l = lateness(u, inAt);
  const shiftDate = b.date || l.shiftDate;
  const data = { clockIn: inAt, clockOut: outAt, lateSeconds: l.lateSeconds, deduction: l.deduction, source: "admin", autoOut: false, note: b.note || "Edited by admin" };
  const r = await db.attendance.upsert({ where: { userId_shiftDate: { userId: u.id, shiftDate } }, update: data, create: { userId: u.id, shiftDate, ...data, location: b.location || null } });
  return NextResponse.json(r);
}
