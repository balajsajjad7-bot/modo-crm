import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { listDrafts, dropDraft, sendToCustomer, replySettings, DEFAULT_DONT } from "@/lib/waReply";
import { saveSettings, getStatus } from "@/lib/walink";

// Modo → WhatsApp inbox: every chat on the linked number (customers, groups, what you sent from the phone),
// Modo's suggested replies waiting for an OK, and the say / never-say rules.
const who = (id) => (id === "wa-me" ? "me" : id.startsWith("wa:") ? "them" : id === "system" ? "system" : id === "modo-bot" ? "bot" : "team");

export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const c = new URL(req.url).searchParams.get("c");
  if (c) {
    if (!c.startsWith("wa-")) return NextResponse.json({ error: "Not a WhatsApp chat." }, { status: 400 });
    const rows = await db.message.findMany({ where: { conversationId: c, deletedAt: null, parentId: null }, orderBy: { createdAt: "desc" }, take: 200 });
    const ids = [...new Set(rows.map((m) => m.userId))];
    const users = Object.fromEntries((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return NextResponse.json({ messages: rows.reverse().map((m) => ({ id: m.id, side: who(m.userId), by: users[m.userId] || "", text: m.text || (m.fileName ? "📎 " + m.fileName : ""), kind: m.kind, at: m.createdAt })) });
  }
  const convs = await db.conversation.findMany({ where: { id: { startsWith: "wa-" } }, orderBy: { lastMessageAt: "desc" }, take: 300, select: { id: true, name: true, lastMessageAt: true } });
  const last = await Promise.all(convs.map((cv) => db.message.findFirst({ where: { conversationId: cv.id, deletedAt: null, kind: { not: "SYSTEM" } }, orderBy: { createdAt: "desc" }, select: { userId: true, text: true, createdAt: true } })));
  const drafts = await listDrafts();
  const st = await getStatus();
  return NextResponse.json({
    linked: st.state === "open", me: st.me || "",
    chats: convs.map((cv, i) => ({ id: cv.id, name: cv.name.replace(/^WhatsApp( group)? · /, ""), group: cv.id.startsWith("wa-g-"), at: cv.lastMessageAt, last: last[i]?.text || "", lastSide: last[i] ? who(last[i].userId) : "", waiting: last[i] ? who(last[i].userId) === "them" : false, draft: drafts.find((d) => d.conv === cv.id) || null })),
    drafts, rules: await replySettings(), defaultDont: DEFAULT_DONT,
  });
}

export async function POST(req) {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const text = String(b.text || "").trim().slice(0, 4000);
  try {
    if (b.action === "send") {
      if (!String(b.c || "").startsWith("wa-") || !text) return NextResponse.json({ error: "Type a message." }, { status: 400 });
      await dropDraft((d) => d.conv === b.c); // you answered, so Modo's suggestion is no longer needed
      const r = await sendToCustomer(b.c, text, session.uid);
      return NextResponse.json(r.ok ? { ok: true, queued: !!r.queued } : { error: r.error }, { status: r.ok ? 200 : 502 });
    }
    if (b.action === "new") {
      let n = String(b.to || "").replace(/\D/g, "").replace(/^00/, ""); if (n.length === 10) n = "1" + n; else if (n.length === 11 && n.startsWith("03")) n = "92" + n.slice(1); // US 10-digit, Pakistani 03xx
      if (n.length < 11) return NextResponse.json({ error: "Type the number with country code, e.g. 1 305 555 0199." }, { status: 400 });
      if (!text) return NextResponse.json({ error: "Type a message." }, { status: 400 });
      const id = "wa-" + n;
      await db.conversation.upsert({ where: { id }, update: {}, create: { id, name: `WhatsApp · ${b.name ? String(b.name).slice(0, 30) + " " : ""}+${n}`, isGroup: true, topic: "Customer WhatsApp chat — what you type here is sent to the customer on WhatsApp" } });
      const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
      await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: id, userId: u.id })), skipDuplicates: true });
      const r = await sendToCustomer(id, text, session.uid);
      return NextResponse.json(r.ok ? { ok: true, id, queued: !!r.queued } : { error: r.error, id }, { status: r.ok ? 200 : 502 });
    }
    if (b.action === "draft") {
      const d = (await listDrafts()).find((x) => x.code === Number(b.code));
      if (!d) return NextResponse.json({ error: "That suggestion was already handled." }, { status: 404 });
      await dropDraft((x) => x.code === d.code);
      if (b.op === "skip") return NextResponse.json({ ok: true });
      const r = await sendToCustomer(d.conv, text || d.draft, session.uid);
      return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 502 });
    }
    if (b.action === "rules") {
      const mode = ["ask", "auto", "off"].includes(b.mode) ? b.mode : "ask";
      await saveSettings({ mode, aiReply: mode === "off" ? "off" : "on", say: String(b.say || "").slice(0, 4000), dont: String(b.dont || "").slice(0, 4000) || DEFAULT_DONT, allowLinks: !!b.allowLinks });
      return NextResponse.json({ ok: true, rules: await replySettings() });
    }
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
