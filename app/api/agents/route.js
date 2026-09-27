import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { slipsFor } from "@/lib/month";
import { emit } from "@/lib/connectors";

const pick = (b) => ({
  name: b.name, email: b.email || null, phone: b.phone || null, cnic: b.cnic || null,
  vicidialUser: b.vicidialUser || null, baseSalary: Number(b.baseSalary) || 0,
  shiftStart: b.shiftStart || "19:00", shiftHours: Number(b.shiftHours) || 9,
  workDays: b.workDays || "1,2,3,4,5,6", graceMinutes: Number(b.graceMinutes) || 0,
  departmentId: b.departmentId || null, campaignId: b.campaignId || null,
});

export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const month = new URL(req.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const users = await db.user.findMany({ where: { role: "AGENT" }, orderBy: { agentId: "asc" } });
  const slips = await slipsFor(users, month);
  return NextResponse.json(slips.map(({ user: { passwordHash, totpSecret, ...u }, attendance, slip }) => ({ ...u, attendance, slip })));
}

export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  if (!b.name || !b.password || b.password.length < 6) return NextResponse.json({ error: "Name and a password of at least 6 characters are required." }, { status: 400 });
  const count = await db.user.count({ where: { role: "AGENT" } });
  let agentId = "MD" + String(1001 + count);
  while (await db.user.findUnique({ where: { agentId } })) agentId = "MD" + (Number(agentId.slice(2)) + 1);
  const u = await db.user.create({ data: { ...pick(b), agentId, role: "AGENT", passwordHash: await bcrypt.hash(b.password, 10) } });
  await emit("agent.created", { agent: u.name, id: u.agentId, shift: u.shiftStart });
  return NextResponse.json({ agentId: u.agentId, id: u.id });
}
