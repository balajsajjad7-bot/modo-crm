import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { scope, names } from "@/lib/crm";
import { permsFor } from "@/lib/perms";

// Callback notepad: my customers with the last thing we talked about and the next callback.
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const p = await permsFor(s);
  if (!p.notepad) return NextResponse.json({ error: "Admin has turned the notepad off for agents." }, { status: 403 });
  const owner = new URL(req.url).searchParams.get("owner");
  const contacts = await db.contact.findMany({ where: scope(s, "ownerId", owner), orderBy: { updatedAt: "desc" }, take: 1000 });
  const ids = contacts.map((c) => c.id);
  const [notes, calls] = await Promise.all([
    ids.length ? db.crmActivity.findMany({ where: { contactId: { in: ids }, kind: { in: ["note", "call"] } }, orderBy: { createdAt: "desc" } }) : [],
    ids.length ? db.task.findMany({ where: { contactId: { in: ids }, done: false }, orderBy: { dueAt: "asc" } }) : [],
  ]);
  const n = await names([...contacts.map((c) => c.ownerId), ...notes.map((x) => x.userId)]);
  return NextResponse.json({
    perms: p,
    rows: contacts.map((c) => {
      const mine = notes.filter((x) => x.contactId === c.id);
      const next = calls.find((t) => t.contactId === c.id && t.dueAt) || calls.find((t) => t.contactId === c.id);
      return {
        id: c.id, name: c.name, owner: n[c.ownerId],
        phone: p.seeContactInfo ? c.phone : c.phone ? "•••• " + String(c.phone).slice(-2) : null,
        city: c.city, tags: c.tags,
        lastNote: mine[0] ? { id: mine[0].id, text: mine[0].text, kind: mine[0].kind, at: mine[0].createdAt, by: n[mine[0].userId], canEdit: mine[0].userId === s.uid || s.role === "ADMIN" } : null,
        history: mine.slice(0, 30).map((x) => ({ id: x.id, text: x.text, kind: x.kind, at: x.createdAt, by: n[x.userId], canEdit: x.userId === s.uid || s.role === "ADMIN" })),
        nextCallback: next ? { id: next.id, title: next.title, dueAt: next.dueAt } : null,
      };
    }),
  });
}
