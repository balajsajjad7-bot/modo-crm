// One place that handles an incoming WhatsApp message, whichever way WhatsApp is connected
// (linked number through the relay, or Meta Cloud API). Returns the replies to send back.
import { db } from "./db";
import { askAI } from "./ai";
import { sendPush } from "./push";
import { handleCommand } from "./botCommands";
import { digits, waAdmins, waAiReply } from "./whatsapp";

const KIND = { image: "📷 Photo", audio: "🎤 Voice message", video: "🎬 Video", document: "📎 Document", sticker: "Sticker", location: "📍 Location" };

export async function handleIncoming({ from, name = "", text = "", kind = "text", msgId = "", hidden = false }) {
  from = digits(from);
  if (!from) return [];
  // Admin numbers → the Modo bot
  if ((await waAdmins()).includes(from)) {
    const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    try { return [text ? await handleCommand(text, { uid: admin?.id, name: (admin?.name || "Admin") + " (WhatsApp)", role: "ADMIN" }) : "I can only read text messages. Type help to see what I can do."]; }
    catch (e) { return ["Sorry, that didn't work: " + (e.message || "error")]; }
  }
  // Customer → their own conversation in Modo Chat
  const id = "wa-" + from;
  const title = (hidden ? `WhatsApp · ${name || "Customer"} (number hidden)` : `WhatsApp · ${name ? name + " " : ""}+${from}`).slice(0, 60);
  await db.conversation.upsert({ where: { id }, update: name ? { name: title } : {}, create: { id, name: title, isGroup: true, topic: "Customer WhatsApp chat — what you type here is sent to the customer on WhatsApp" } });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: id, userId: u.id })), skipDuplicates: true });
  if (msgId) { const seen = await db.message.findUnique({ where: { id: "wam-" + msgId } }).catch(() => null); if (seen) return []; }
  const shown = text || (KIND[kind] || "Message") + " (open WhatsApp to see it)";
  await db.message.create({ data: { ...(msgId ? { id: "wam-" + msgId } : {}), conversationId: id, userId: "wa:" + from, kind: "TEXT", text: shown.slice(0, 4000) } });
  await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
  const members = (await db.convMember.findMany({ where: { conversationId: id }, select: { userId: true } })).map((m) => m.userId);
  sendPush(members, { title: `📱 ${name || "+" + from} on WhatsApp`, body: shown.slice(0, 140), url: "/admin/chat", tag: "chat-" + id }).catch(() => {});

  if (!text || !(await waAiReply())) return [];
  // A team member answered in the last 30 minutes → let the human handle it
  const human = await db.message.findFirst({ where: { conversationId: id, createdAt: { gte: new Date(Date.now() - 30 * 60000) }, NOT: [{ userId: { startsWith: "wa:" } }, { userId: "modo-bot" }, { userId: "system" }] } });
  if (human) return [];
  let answer = "";
  try {
    const recent = await db.message.findMany({ where: { conversationId: id, kind: "TEXT", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, select: { userId: true, text: true } });
    const turns = recent.reverse().map((m) => ({ role: m.userId.startsWith("wa:") ? "user" : "assistant", content: m.text || "" })).filter((t) => t.content);
    while (turns.length && turns[0].role !== "user") turns.shift();
    answer = await askAI("You are Modo, replying on WhatsApp for a US telecom/utility savings company. Be friendly, short and honest. Use only the company's approved info; never invent prices, discounts, free phones or gifts, and never claim to be Verizon/AT&T/T-Mobile or any provider. Never ask for passwords, PINs, one-time codes, full card numbers or SSNs. If they want to stop messages, confirm you'll stop. If you can't help, say a team member will reply soon.", turns.length ? turns : text, { maxTokens: 400 });
  } catch {}
  if (!answer) return [];
  await db.message.create({ data: { conversationId: id, userId: "modo-bot", kind: "TEXT", text: String(answer).slice(0, 4000) } });
  return [answer];
}
