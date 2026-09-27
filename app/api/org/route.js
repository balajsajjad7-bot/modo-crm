import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, requireRole } from "@/lib/auth";

// Departments and campaigns. Everyone can read them (for labels); only admin can change them.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [departments, campaigns, users] = await Promise.all([
    db.department.findMany({ orderBy: { createdAt: "asc" } }), db.campaign.findMany({ orderBy: { createdAt: "asc" } }),
    s.role === "ADMIN" ? db.user.findMany({ select: { departmentId: true, campaignId: true, active: true } }) : [],
  ]);
  const cnt = (k, id) => users.filter((u) => u.active && u[k] === id).length;
  return NextResponse.json({
    departments: departments.map((d) => ({ ...d, people: cnt("departmentId", d.id) })),
    campaigns: campaigns.map((c) => ({ ...c, people: cnt("campaignId", c.id) })),
  });
}
// { kind: "department" | "campaign", name, email?, color? }
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json(); const name = String(b.name || "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
  if (b.kind === "department") return NextResponse.json(await db.department.create({ data: { name, email: String(b.email || "").trim() || null, color: b.color || "#ff6b4a" } }));
  if (b.kind === "campaign") return NextResponse.json(await db.campaign.create({ data: { name, color: b.color || "#ffb347" } }));
  return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
}
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json(); const data = {};
  if ("name" in b) data.name = String(b.name).trim().slice(0, 60);
  if ("color" in b) data.color = b.color;
  if (b.kind === "department" && "email" in b) data.email = String(b.email || "").trim() || null;
  if (b.kind === "campaign" && "active" in b) data.active = !!b.active;
  const m = b.kind === "department" ? db.department : db.campaign;
  return NextResponse.json(await m.update({ where: { id: b.id }, data }));
}
export async function DELETE(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const q = new URL(req.url).searchParams; const id = q.get("id"), kind = q.get("kind");
  if (kind === "department") { await db.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } }); await db.department.delete({ where: { id } }).catch(() => {}); }
  if (kind === "campaign") { await db.user.updateMany({ where: { campaignId: id }, data: { campaignId: null } }); await db.campaign.delete({ where: { id } }).catch(() => {}); }
  return NextResponse.json({ ok: true });
}
