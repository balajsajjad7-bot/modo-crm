import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { startCall, endCall, saveResult, recentCalls } from "@/lib/calls";
import { log } from "@/lib/crm";

const d10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const manager = (s) => s.role === "ADMIN" || s.role === "SUPERVISOR";

// Recent calls. Agents see their own; admin/supervisors see everyone (?mine=1 for only theirs).
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const mine = !manager(s) || q.get("mine") === "1";
  const rows = await recentCalls({ userId: mine ? s.uid : undefined, limit: Number(q.get("limit")) || 50, since: q.get("days") ? new Date(Date.now() - Number(q.get("days")) * 864e5) : undefined });
  return NextResponse.json({ rows: rows.map((r) => ({ ...r, agent: r.user?.name })) });
}

// Manual / Google Voice dialer: { action: "start", phone, name } → { id }; { action: "end", id, code, label, note, seconds }
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const phone = d10(b.phone);
  const source = ["gvoice", "manual", "webphone"].includes(b.source) ? b.source : "webphone";
  if (b.action === "start") {
    if (phone.length !== 10) return NextResponse.json({ error: "Enter a 10-digit US number." }, { status: 400 });
    const c = await startCall(s.uid, { phone, name: String(b.name || "").slice(0, 120) || null, source });
    return NextResponse.json({ id: c?.id });
  }
  if (b.action === "end") {
    const c = b.code || b.note ? await saveResult(s.uid, { id: b.id, phone, name: b.name, code: b.code, label: b.label, note: b.note, source, seconds: b.seconds }) : await endCall(s.uid, { id: b.id });
    // Same as the VICIdial dialer: the note goes on the customer in Modo (created if new)
    if (phone.length === 10 && (b.code || b.note)) {
      try {
        const near = await db.contact.findMany({ where: { phone: { contains: phone.slice(-4) } }, take: 50 });
        let ct = near.find((x) => d10(x.phone) === phone);
        if (!ct) ct = await db.contact.create({ data: { name: String(b.name || "").trim() || "Caller " + phone.slice(-4), phone, tags: "dialer", source: "Modo phone", ownerId: s.uid } });
        await log(s.uid, { contactId: ct.id, kind: "call", text: `${b.label || b.code || "Call"}${b.note ? " · " + String(b.note).slice(0, 1500) : ""}` });
        if (b.callbackAt) await db.task.create({ data: { title: `Call back ${ct.name}`, type: "callback", dueAt: new Date(b.callbackAt), contactId: ct.id, assigneeId: s.uid, createdById: s.uid, notes: b.note || null } });
      } catch {}
    }
    return NextResponse.json({ ok: true, call: c });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
