import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const people = await db.user.findMany({ where: { active: true, id: { not: s.uid } }, select: { id: true, name: true, agentId: true, role: true, lastSeenAt: true }, orderBy: { name: "asc" } });
  return NextResponse.json(people.map(({ lastSeenAt, ...p }) => ({ ...p, online: !!lastSeenAt && Date.now() - new Date(lastSeenAt) < 60000 })));
}
