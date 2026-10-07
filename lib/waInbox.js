// One place that handles an incoming WhatsApp message, whichever way WhatsApp is connected
// (linked number through the relay, or Meta Cloud API). Returns the replies to send back.
// Every chat on the linked number lands in Modo → WhatsApp inbox (customers, groups, and what you send from the phone).
import { db } from "./db";
import { askAI } from "./ai";
import { sendPush } from "./push";
import { handleCommand } from "./botCommands";
import { digits, waAdmins, alertAdminsWA } from "./whatsapp";
import { replySettings, rulesPrompt, stripLinks, addDraft } from "./waReply";

const KIND = { image: "📷 Photo", audio: "🎤 Voice message", video: "🎬 Video", document: "📎 Document", sticker: "Sticker", location: "📍 Location" };

async function ensureConv(id, title, topic, rename = true) {
  await db.conversation.upsert({ where: { id }, update: rename ? { name: title.slice(0, 60) } : {}, create: { id, name: title.slice(0, 60), isGroup: true, topic } });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: id, userId: u.id })), skipDuplicates: true });
}
async function seen(msgId) { return msgId ? !!(await db.message.findUnique({ where: { id: "wam-" + msgId } }).catch(() => null)) : false; }

export async function handleIncoming({ from, name = "", text = "", kind = "text", msgId = "", hidden = false, fromMe = false, group = "", groupName = "" }) {
  const shown = text || (KIND[kind] || "Message") + " (open WhatsApp to see it)";

  // A WhatsApp group on the linked number → its own conversation (read and reply from Modo; the AI never answers groups).
  if (group) {
    const gid = String(group).split("@")[0].replace(/[^\d-]/g, ""); if (!gid) return [];
    const id = "wa-g-" + gid;
    await ensureConv(id, `WhatsApp group · ${groupName || gid}`, "WhatsApp group — what you type here is sent to the group", !!groupName);
    if (await seen(msgId)) return [];
    const by = fromMe ? "wa-me" : "wa:" + (digits(from) || "0");
    await db.message.create({ data: { ...(msgId ? { id: "wam-" + msgId } : {}), conversationId: id, userId: by, kind: "TEXT", text: (fromMe ? shown : `${name || "+" + digits(from)}: ${shown}`).slice(0, 4000) } });
    await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    return [];
  }

  from = digits(from);
  if (!from) return [];
  // Something you sent from the phone itself → keep the conversation complete in Modo.
  if (fromMe) {
    const id = "wa-" + from;
    if (await seen(msgId)) return [];
    await ensureConv(id, `WhatsApp · +${from}`, "Customer WhatsApp chat — what you type here is sent to the customer on WhatsApp", false);
    await db.message.create({ data: { ...(msgId ? { id: "wam-" + msgId } : {}), conversationId: id, userId: "wa-me", kind: "TEXT", text: shown.slice(0, 4000) } });
    await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    return [];
  }
  // Admin numbers → the Modo bot
  if ((await waAdmins()).includes(from)) {
    const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    try { return [text ? await handleCommand(text, { uid: admin?.id, name: (admin?.name || "Admin") + " (WhatsApp)", role: "ADMIN" }) : "I can only read text messages. Type help to see what I can do."]; }
    catch (e) { return ["Sorry, that didn't work: " + (e.message || "error")]; }
  }
  // Customer → their own conversation in Modo
  const id = "wa-" + from;
  const title = (hidden ? `WhatsApp · ${name || "Customer"} (number hidden)` : `WhatsApp · ${name ? name + " " : ""}+${from}`).slice(0, 60);
  await ensureConv(id, title, "Customer WhatsApp chat — what you type here is sent to the customer on WhatsApp", !!name);
  if (await seen(msgId)) return [];
  await db.message.create({ data: { ...(msgId ? { id: "wam-" + msgId } : {}), conversationId: id, userId: "wa:" + from, kind: "TEXT", text: shown.slice(0, 4000) } });
  await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
  const members = (await db.convMember.findMany({ where: { conversationId: id }, select: { userId: true } })).map((m) => m.userId);
  sendPush(members, { title: `📱 ${name || "+" + from} on WhatsApp`, body: shown.slice(0, 140), url: "/admin/whatsapp/inbox", tag: "chat-" + id }).catch(() => {});

  const rules = await replySettings();
  if (!text || rules.mode === "off") return [];
  // A team member answered in the last 30 minutes → let the human handle it
  const human = await db.message.findFirst({ where: { conversationId: id, createdAt: { gte: new Date(Date.now() - 30 * 60000) }, NOT: [{ userId: { startsWith: "wa:" } }, { userId: "modo-bot" }, { userId: "system" }] } });
  if (human) return [];
  let answer = "";
  try {
    const recent = await db.message.findMany({ where: { conversationId: id, kind: "TEXT", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, select: { userId: true, text: true } });
    const turns = recent.reverse().map((m) => ({ role: m.userId.startsWith("wa:") ? "user" : "assistant", content: m.text || "" })).filter((t) => t.content);
    while (turns.length && turns[0].role !== "user") turns.shift();
    answer = await askAI("You are Modo, replying on WhatsApp to a customer of a US telecom/utility savings company. Be friendly, short (1–3 sentences) and honest. Use only the company's approved info. If they want to stop messages, confirm you'll stop. If you can't help, say a team member will reply soon." + rulesPrompt(rules), turns.length ? turns : text, { maxTokens: 300 });
  } catch {}
  answer = String(answer || "").trim();
  if (!rules.allowLinks) answer = stripLinks(answer) || (answer ? "Thanks for your message! A team member will get back to you shortly." : "");
  if (!answer) return [];

  if (rules.mode === "auto") {
    await db.message.create({ data: { conversationId: id, userId: "modo-bot", kind: "TEXT", text: answer.slice(0, 4000) } });
    return [answer];
  }
  // "ask": nothing goes to the customer until the admin says so.
  const d = await addDraft({ conv: id, to: hidden ? "" : from, name: name || (hidden ? "Customer" : ""), question: text, draft: answer });
  await db.message.create({ data: { conversationId: id, userId: "system", kind: "SYSTEM", text: `💡 Modo suggests (NOT sent — waiting for your OK, #${d.code}): ${answer}`.slice(0, 4000) } });
  const who = `${name || "Customer"}${hidden ? "" : " (+" + from + ")"}`;
  alertAdminsWA(`💬 #${d.code} ${who} wrote:\n“${text.slice(0, 500)}”\n\n💡 I'd reply:\n“${answer}”\n\nReply YES to send it, NO to skip, or say <your words> to send your own reply.`).catch(() => {});
  const admins = (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })).map((u) => u.id);
  sendPush(admins, { title: `💬 ${who} is waiting — OK the reply?`, body: answer.slice(0, 140), url: "/admin/whatsapp/inbox", tag: "wadraft-" + id }).catch(() => {});
  return [];
}
