import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const since = new Date(Date.now() - 12 * 3600000);
  const list = await db.callSession.findMany({
    where: { startedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 50,
    include: { user: { select: { name: true, agentId: true } } },
  });
  return NextResponse.json(list);
}
