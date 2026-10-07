import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { signStatus, getSign } from "@/lib/contractSign";

// Admin: has this agent signed their contract? (name, time, address, signature image)
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const uid = new URL(req.url).searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Which agent?" }, { status: 400 });
  const u = await db.user.findUnique({ where: { id: uid }, select: { contract: true } });
  const st = await signStatus(uid, u?.contract);
  const raw = st.signed ? await getSign(uid) : null;
  return NextResponse.json({ ...st, ip: raw?.ip || "" });
}
