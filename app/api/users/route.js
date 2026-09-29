import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole, requireAdminOnly } from "@/lib/auth";

// All sign-in accounts (admins and agents)
export async function GET() {
  const { error } = await requireAdminOnly();
  if (error) return error;
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, agentId: true, name: true, email: true, role: true, active: true, departmentId: true, campaignId: true, totpEnabled: true, supAccess: true, lastSeenAt: true, createdAt: true } });
  return NextResponse.json(users);
}
// Create an admin: { name, loginId, password, email?, departmentId? }  (agents are added on the Agents page)
export async function POST(req) {
  const { error } = await requireAdminOnly();
  if (error) return error;
  const b = await req.json();
  const loginId = String(b.loginId || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!String(b.name || "").trim() || loginId.length < 3) return NextResponse.json({ error: "Name and a login ID of at least 3 letters/numbers are required." }, { status: 400 });
  if (String(b.password || "").length < 8) return NextResponse.json({ error: "Admin passwords need at least 8 characters." }, { status: 400 });
  if (await db.user.findUnique({ where: { agentId: loginId } })) return NextResponse.json({ error: `${loginId} is already taken.` }, { status: 400 });
  const role = b.role === "SUPERVISOR" ? "SUPERVISOR" : "ADMIN";
  const supAccess = role === "SUPERVISOR" ? JSON.stringify((Array.isArray(b.supAccess) ? b.supAccess : []).map(String).slice(0, 60)) : "[]";
  const u = await db.user.create({ data: { agentId: loginId, name: b.name.trim().slice(0, 80), email: b.email || null, role, supAccess, departmentId: b.departmentId || null, passwordHash: await bcrypt.hash(b.password, 10) } });
  return NextResponse.json({ id: u.id, agentId: u.agentId, role });
}
