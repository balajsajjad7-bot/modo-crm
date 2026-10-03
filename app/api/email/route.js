import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/perms";
import { sendMail } from "@/lib/mailer";
import { log } from "@/lib/crm";
import { configFor } from "@/lib/connectors";

// Recent emails (admin) and whether SMTP is set up
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const ready = !!(await configFor("smtp"))?.host;
  if (s.role !== "ADMIN") return NextResponse.json({ ready, logs: [] });
  const logs = await db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const u = await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.sentById))] } }, select: { id: true, name: true } });
  return NextResponse.json({ ready, logs: logs.map((l) => ({ ...l, by: u.find((x) => x.id === l.sentById)?.name })) });
}

// { to, subject, body, contactId?, saleId? }
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await can(s, "emailCustomers"))) return NextResponse.json({ error: "Admin has turned email off for agents." }, { status: 403 });
  const b = await req.json();
  const to = String(b.to || "").trim(), subject = String(b.subject || "").trim().slice(0, 200), body = String(b.body || "").trim().slice(0, 20000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!subject || !body) return NextResponse.json({ error: "Add a subject and a message." }, { status: 400 });
  const dept = b.departmentId ? await db.department.findUnique({ where: { id: b.departmentId } }) : null;
  let status = "sent", error = null;
  try { await sendMail({ to, subject, body, fromName: dept ? `Modo · ${dept.name}` : undefined, replyTo: dept?.email || undefined }); } catch (e) { status = "failed"; error = e.message; }
  await db.emailLog.create({ data: { to, subject, body, status, error, contactId: b.contactId || null, saleId: b.saleId || null, sentById: s.uid } });
  if (b.contactId && status === "sent") await log(s.uid, { contactId: b.contactId, kind: "note", text: `✉️ Emailed "${subject}" to ${to}` }).catch(() => {});
  if (status === "failed") return NextResponse.json({ error: "Email not sent: " + error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
