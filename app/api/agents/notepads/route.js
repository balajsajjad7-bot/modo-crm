import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// Admin: every agent's personal notepad (their scratchpad), read-only.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const agents = await db.user.findMany({
    where: { role: "AGENT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, agentId: true, padText: true, lastSeenAt: true },
  });
  return NextResponse.json(agents.map((a) => ({ ...a, online: !!a.lastSeenAt && Date.now() - new Date(a.lastSeenAt) < 90000 })));
}
