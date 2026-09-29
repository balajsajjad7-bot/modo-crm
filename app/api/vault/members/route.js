import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCeo } from "@/lib/auth";

// CEO-only: see everyone and toggle who is invited to the shared Secure line.
export async function GET() {
  const { error } = await requireCeo();
  if (error) return error;
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, agentId: true, role: true, ceo: true, secureLine: true },
  });
  return NextResponse.json(users);
}

export async function PATCH(req) {
  const { error } = await requireCeo();
  if (error) return error;
  const { id, on } = await req.json();
  if (!id) return NextResponse.json({ error: "Which user?" }, { status: 400 });
  const u = await db.user.findUnique({ where: { id }, select: { ceo: true } });
  if (!u) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (u.ceo) return NextResponse.json({ error: "The CEO is always on." }, { status: 400 });
  await db.user.update({ where: { id }, data: { secureLine: !!on } });
  return NextResponse.json({ ok: true });
}
