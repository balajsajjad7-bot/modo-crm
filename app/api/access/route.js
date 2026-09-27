import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PERMS, permsFor } from "@/lib/perms";

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  return NextResponse.json({ perms: PERMS, values: await permsFor({ role: "AGENT" }) });
}
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  const clean = Object.fromEntries(Object.keys(PERMS).filter((k) => k in b).map((k) => [k, !!b[k]]));
  await db.setting.update({ where: { id: "global" }, data: { agentPerms: JSON.stringify(clean) } });
  return NextResponse.json({ ok: true, values: await permsFor({ role: "AGENT" }) });
}
