import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// { active?, password?, reset2fa?, name?, email?, departmentId?, campaignId? }
export async function PATCH(req, { params }) {
  const { session, error } = await requireRole("ADMIN");
  if (error) return error;
  const u = await db.user.findUnique({ where: { id: params.id } });
  if (!u) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const b = await req.json(); const data = {};
  if ("active" in b) {
    if (u.id === session.uid && !b.active) return NextResponse.json({ error: "You can't suspend yourself." }, { status: 400 });
    if (u.role === "ADMIN" && !b.active && (await db.user.count({ where: { role: "ADMIN", active: true } })) <= 1) return NextResponse.json({ error: "There must be at least one active admin." }, { status: 400 });
    data.active = !!b.active;
  }
  if (b.password) { if (String(b.password).length < (u.role === "ADMIN" ? 8 : 6)) return NextResponse.json({ error: `Password needs at least ${u.role === "ADMIN" ? 8 : 6} characters.` }, { status: 400 }); data.passwordHash = await bcrypt.hash(b.password, 10); }
  if (b.reset2fa) { data.totpSecret = null; data.totpEnabled = false; }
  for (const k of ["name", "email", "departmentId", "campaignId"]) if (k in b) data[k] = b[k] || null;
  if ("name" in data && !data.name) delete data.name;
  await db.user.update({ where: { id: u.id }, data });
  return NextResponse.json({ ok: true });
}
