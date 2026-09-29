import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { sendPush } from "@/lib/push";

// Admin sends a push alert to one agent, everyone, or a whole campaign/department.
export async function POST(req) {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "Message from admin").slice(0, 80);
  const body = String(b.body || "").slice(0, 300);
  if (!body) return NextResponse.json({ error: "Write a message." }, { status: 400 });
  let userIds = [];
  if (b.userId) userIds = [b.userId];
  else if (b.all) userIds = (await db.user.findMany({ where: { active: true, id: { not: session.uid } }, select: { id: true } })).map((u) => u.id);
  else if (b.campaignId) userIds = (await db.user.findMany({ where: { active: true, campaignId: b.campaignId }, select: { id: true } })).map((u) => u.id);
  else return NextResponse.json({ error: "Pick who to notify." }, { status: 400 });
  await sendPush(userIds, { title, body, url: "/agent", urgent: !!b.urgent, tag: "admin" });
  return NextResponse.json({ ok: true, sent: userIds.length });
}
