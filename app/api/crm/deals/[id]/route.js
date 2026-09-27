import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canTouch, log, stageLabel, STAGES } from "@/lib/crm";
import { can } from "@/lib/perms";

export async function PATCH(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const d = await db.deal.findUnique({ where: { id: params.id } });
  if (!d || !canTouch(s, d)) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  if (!(await can(s, "deals"))) return NextResponse.json({ error: "Admin has turned this off for agents." }, { status: 403 });
  const b = await req.json(); const data = {};
  if ("title" in b) data.title = String(b.title).slice(0, 120) || d.title;
  if ("value" in b) data.value = Number(b.value) || 0;
  if ("service" in b) data.service = b.service || null;
  if ("expectedClose" in b) data.expectedClose = b.expectedClose ? new Date(b.expectedClose) : null;
  if ("position" in b) data.position = Number(b.position) || 0;
  if ("lostReason" in b) data.lostReason = b.lostReason || null;
  if (s.role === "ADMIN" && b.ownerId) data.ownerId = b.ownerId;
  if (b.stage && b.stage !== d.stage && STAGES.some((x) => x.id === b.stage)) {
    data.stage = b.stage;
    await log(s.uid, { contactId: d.contactId, dealId: d.id, kind: "stage", text: `${s.name} moved "${d.title}" from ${stageLabel(d.stage)} to ${stageLabel(b.stage)}${b.stage === "lost" && b.lostReason ? ` (${b.lostReason})` : ""}` });
  }
  return NextResponse.json(await db.deal.update({ where: { id: d.id }, data }));
}

export async function DELETE(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const d = await db.deal.findUnique({ where: { id: params.id } });
  if (!d || !canTouch(s, d)) return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  await db.deal.delete({ where: { id: d.id } });
  return NextResponse.json({ ok: true });
}
