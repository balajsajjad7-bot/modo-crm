import { NextResponse } from "next/server";
import crypto from "crypto";
import { configFor } from "@/lib/connectors";
import { askAI } from "@/lib/ai";
import { db } from "@/lib/db";
import { sendPush } from "@/lib/push";
import { digits, waConfig, sendWA, isAdminNumber, aiReplyOn } from "@/lib/whatsapp";
import { handleCommand } from "@/lib/botCommands";

export const maxDuration = 60;

// Meta calls this to verify the webhook (GET) and to deliver messages (POST).
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const mode = p.get("hub.mode"), token = p.get("hub.verify_token"), challenge = p.get("hub.challenge");
  const cfg = (await configFor("whatsapp")) || {};
  const verify = cfg.verifyToken || process.env.WA_VERIFY_TOKEN;
  if (mode === "subscribe" && token && verify && token === verify) return new Response(challenge || "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

// Incoming WhatsApp message:
//  • from an admin number → the Modo bot answers (sales, online, late, callbacks, coach, tracking, AI…)
//  • from anyone else → a customer chat in Modo (Chat → WhatsApp conversations) that admins and added agents
//    can read and answer; optionally Modo AI replies first (Connectors → WhatsApp → AI auto-reply).
export async function POST(req) {
  const raw = await req.text().catch(() => "");
  let body = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  try {
    // With the App secret set, only messages genuinely signed by Meta are accepted (stops fake admin commands).
    const sec = (await waConfig())?.appSecret;
    if (sec) {
      const sig = req.headers.get("x-hub-signature-256") || "";
      const want = "sha256=" + crypto.createHmac("sha256", sec).update(raw).digest("hex");
      if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return NextResponse.json({ ok: true });
    }
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return NextResponse.json({ ok: true }); // delivery/status events
    const from = digits(msg.from);
    const cfg = await waConfig();
    if (!cfg || !from) return NextResponse.json({ ok: true });
    const text = msg.type === "text" ? (msg.text?.body || "") : msg.type === "button" ? (msg.button?.text || "") : msg.type === "interactive" ? (msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "") : "";
    const profile = value?.contacts?.[0]?.profile?.name || "";

    if (isAdminNumber(cfg, from)) {
      const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
      let answer;
      try { answer = text ? await handleCommand(text, { uid: admin?.id, name: (admin?.name || "Admin") + " (WhatsApp)", role: "ADMIN" }) : "I can only read text messages. Type help to see what I can do."; }
      catch (e) { answer = "Sorry, that didn't work: " + (e.message || "error"); }
      await sendWA(from, answer, cfg);
      return NextResponse.json({ ok: true });
    }

    // Customer → their own conversation in Modo
    const id = "wa-" + from;
    const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
    const name = `WhatsApp · ${profile ? profile + " " : ""}+${from}`.slice(0, 60);
    await db.conversation.upsert({ where: { id }, update: profile ? { name } : {}, create: { id, name, isGroup: true, topic: "Customer WhatsApp chat — what you type here is sent to the customer on WhatsApp" } });
    if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: id, userId: u.id })), skipDuplicates: true });
    const shown = text || ({ image: "📷 Photo", audio: "🎤 Voice message", video: "🎬 Video", document: "📎 Document", sticker: "Sticker", location: "📍 Location" }[msg.type] || "Message") + " (open WhatsApp to see it)";
    const exists = await db.message.findUnique({ where: { id: "wam-" + msg.id } }).catch(() => null);
    if (exists) return NextResponse.json({ ok: true }); // Meta retries: never store twice
    await db.message.create({ data: { id: "wam-" + msg.id, conversationId: id, userId: "wa:" + from, kind: "TEXT", text: shown.slice(0, 4000) } });
    await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    const members = (await db.convMember.findMany({ where: { conversationId: id }, select: { userId: true } })).map((m) => m.userId);
    sendPush(members, { title: `📱 ${profile || "+" + from} on WhatsApp`, body: shown.slice(0, 140), url: "/admin/chat", tag: "chat-" + id }).catch(() => {});

    if (text && aiReplyOn(cfg)) {
      let answer = "";
      try {
        const recent = await db.message.findMany({ where: { conversationId: id, kind: "TEXT", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, select: { userId: true, text: true } });
        const turns = recent.reverse().map((m) => ({ role: m.userId.startsWith("wa:") ? "user" : "assistant", content: m.text || "" })).filter((t) => t.content);
        while (turns.length && turns[0].role !== "user") turns.shift();
        answer = await askAI("You are Modo, replying on WhatsApp for a US telecom/utility savings company. Be friendly, short and honest. Use only the company's approved info; never invent prices, discounts, free phones or gifts, and never claim to be Verizon/AT&T/T-Mobile or any provider. Never ask for passwords, PINs, one-time codes, full card numbers or SSNs. If they want to stop messages, confirm you'll stop. If you can't help, say a team member will reply soon.", turns.length ? turns : text, { maxTokens: 400 });
      } catch {}
      if (answer) {
        const r = await sendWA(from, answer, cfg);
        if (r.ok) await db.message.create({ data: { conversationId: id, userId: "modo-bot", kind: "TEXT", text: String(answer).slice(0, 4000) } });
      }
    }
  } catch { /* never fail the webhook */ }
  return NextResponse.json({ ok: true });
}
