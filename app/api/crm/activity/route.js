import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canTouch, log } from "@/lib/crm";
import { can } from "@/lib/perms";

// Log a note or a call on a customer: { contactId, kind: "note" | "call", text, outcome? }
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await can(s, "addNotes"))) return NextResponse.json({ error: "Admin has turned this off for agents." }, { status: 403 });
  const b = await req.json();
  const c = await db.contact.findUnique({ where: { id: b.contactId || "" } });
  if (!c || !canTouch(s, c)) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const text = String(b.text || "").trim();
  if (!text && !b.outcome) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  const kind = b.kind === "call" ? "call" : "note";
  await log(s.uid, { contactId: c.id, kind, text: kind === "call" ? `Call · ${b.outcome || "logged"}${text ? " · " + text : ""}` : text });
  await db.contact.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
