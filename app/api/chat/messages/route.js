import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember, MAX_FILE, shapeAll } from "@/lib/chat";
import { sendPush } from "@/lib/push";
import { TRAINING_ID, postLesson, cleanLesson } from "@/lib/training";
import { UPSBOT, handleUpsBot } from "@/lib/upsChatBot";
import { BOT } from "@/lib/bots";
import { handleCommand } from "@/lib/botCommands";
import { sendWA } from "@/lib/whatsapp";
import { waBlocked } from "@/lib/waLock";
import { agentCommand } from "@/lib/agentBot";
import { askAI } from "@/lib/ai";

// ?c=<conversation>  [&thread=<parent id>]  [&since=<ISO>]  (since = anything created or changed after)
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const c = q.get("c"), thread = q.get("thread");
  if (!c || !(await isMember(c, s.uid))) return NextResponse.json({ error: "You're not in this conversation." }, { status: 403 });
  if (c.startsWith("wa-")) { const lk = await waBlocked(s); if (lk) return NextResponse.json(lk.body, { status: lk.status }); }
  const where = thread ? { conversationId: c, OR: [{ id: thread }, { parentId: thread }] } : { conversationId: c, parentId: null };
  const list = thread
    ? await db.message.findMany({ where, orderBy: { createdAt: "asc" }, take: 300 })
    : (await db.message.findMany({ where, orderBy: { createdAt: "desc" }, take: 150 })).reverse();
  if (!thread) await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: new Date() } });
  return NextResponse.json(await shapeAll(list, s.uid));
}

// multipart form: c, text?, parentId?, file? (voice=1 for a voice note)
export const maxDuration = 45;

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await req.formData();
  const c = String(form.get("c") || "");
  if (!c || !(await isMember(c, s.uid))) return NextResponse.json({ error: "You're not in this conversation." }, { status: 403 });
  if (c.startsWith("wa-")) { const lk = await waBlocked(s); if (lk) return NextResponse.json(lk.body, { status: lk.status }); }
  const text = String(form.get("text") || "").trim().slice(0, 4000);
  const parentId = String(form.get("parentId") || "") || null;
  if (parentId) {
    const p = await db.message.findUnique({ where: { id: parentId } });
    if (!p || p.conversationId !== c || p.parentId) return NextResponse.json({ error: "Can't reply to that message." }, { status: 400 });
  }
  // #modo-training: only admins post (lessons or messages); agents ask questions in a lesson's thread.
  if (c === TRAINING_ID && !parentId && s.role !== "ADMIN") return NextResponse.json({ error: "Only admins post in #modo-training. Ask your question in the lesson's thread." }, { status: 403 });
  const lessonRaw = form.get("lesson");
  if (lessonRaw) {
    if (c !== TRAINING_ID || s.role !== "ADMIN") return NextResponse.json({ error: "Lessons can only be posted by admins in #modo-training." }, { status: 403 });
    let l = null; try { l = cleanLesson(JSON.parse(String(lessonRaw))); } catch {}
    if (!l) return NextResponse.json({ error: "Give the lesson a title and some content." }, { status: 400 });
    const m = await postLesson(s.uid, l);
    await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: m.createdAt } });
    try {
      const others = (await db.convMember.findMany({ where: { conversationId: c, userId: { not: s.uid } }, select: { userId: true } })).map((x) => x.userId);
      if (others.length) sendPush(others, { title: "📘 New lesson in #modo-training", body: l.title, url: "/admin/chat", tag: "chat-" + c });
    } catch {}
    return NextResponse.json((await shapeAll([m], s.uid))[0]);
  }
  const file = form.get("file");
  const voice = form.get("voice") === "1";
  let data = { conversationId: c, userId: s.uid, kind: "TEXT", text: text || null, parentId };
  if (file && typeof file === "object" && file.size) {
    if (file.size > MAX_FILE) return NextResponse.json({ error: "Files can be up to 4 MB." }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const name = (file.name || (voice ? "voice-note.webm" : "file")).slice(0, 120);
    const mime = file.type || "application/octet-stream";
    const blob = await db.fileBlob.create({ data: { userId: s.uid, name, mime, size: file.size, data: buf } });
    data = { ...data, kind: voice ? "AUDIO" : "FILE", fileId: blob.id, fileName: name, fileMime: mime, fileSize: file.size };
  } else if (!text) {
    return NextResponse.json({ error: "Type a message or attach something." }, { status: 400 });
  }
  const m = await db.message.create({ data });
  if (!parentId) await db.conversation.update({ where: { id: c }, data: { lastMessageAt: m.createdAt } });
  await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: m.createdAt } });
  // Push the other people in this conversation (best-effort; reaches locked phones).
  try {
    const conv = await db.conversation.findUnique({ where: { id: c }, select: { name: true, isChannel: true } });
    const preview = data.kind === "AUDIO" ? "🎤 Voice note" : data.kind === "FILE" ? "📎 " + (data.fileName || "File") : (text || "").slice(0, 120);
    const title = conv?.isChannel ? `#${conv.name || "channel"} · ${s.name}` : s.name;
    const others = (await db.convMember.findMany({ where: { conversationId: c, userId: { not: s.uid } }, select: { userId: true } })).map((x) => x.userId);
    if (others.length) sendPush(others, { title, body: preview, url: "/admin/chat", tag: "chat-" + c });
  } catch {}
  // #ups-bot: the Modo bot answers every admin message (saves tracking on the sale, checks UPS).
  if ((c === UPSBOT || c === BOT) && !parentId && text && s.role === "ADMIN") {
    let reply;
    try { reply = c === BOT ? await handleCommand(text, s) : await handleUpsBot(text, s); } catch (e) { reply = "Sorry, something went wrong: " + (e.message || "unknown error"); }
    const bot = await db.message.create({ data: { conversationId: c, userId: "modo-bot", kind: "TEXT", text: String(reply).slice(0, 3900) } });
    await db.conversation.update({ where: { id: c }, data: { lastMessageAt: bot.createdAt } });
    await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: bot.createdAt } });
  }
  // A bot's own chat (admins): status, run, on/off and the bot's commands (the Workspace bot creates customers' Modos).
  if (c.startsWith("botx-") && !parentId && text && s.role === "ADMIN") {
    let reply;
    try { const { handleBotChat } = await import("@/lib/botChats"); reply = await handleBotChat(c.slice(5), text, s); } catch (e) { reply = "Sorry, something went wrong: " + (e.message || "unknown error"); }
    if (reply) {
      const bot = await db.message.create({ data: { conversationId: c, userId: "modo-bot", kind: "TEXT", text: String(reply).slice(0, 3900) } });
      await db.conversation.update({ where: { id: c }, data: { lastMessageAt: bot.createdAt } });
      await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: bot.createdAt } });
    }
  }
  // Agent's own Modo bot inbox: Modo AI answers as their sales coach.
  if (c === "botdm-" + s.uid && !parentId && text) {
    let reply = "";
    try { reply = (await agentCommand(text, s.uid)) || ""; } catch {}
    if (!reply) try { reply = await askAI("You are the Modo bot, a friendly sales coach for a US call-center agent. Answer briefly and practically: scripts, objections, product facts, American English phrases. Follow the call guide: honest, no pressure, never claim to be the customer's provider, never ask for passwords, PINs, one-time codes, card numbers or SSNs. If the agent asks for their campaign speech or to practise, use the campaign speeches from the admin.", text, { maxTokens: 600, campaignId: (await db.user.findUnique({ where: { id: s.uid }, select: { campaignId: true } }).catch(() => null))?.campaignId || "" }); }
    catch (e) { reply = "I couldn't answer right now: " + (e.message || "AI error"); }
    const bot = await db.message.create({ data: { conversationId: c, userId: "modo-bot", kind: "TEXT", text: String(reply).slice(0, 3900) } });
    await db.convMember.update({ where: { conversationId_userId: { conversationId: c, userId: s.uid } }, data: { lastReadAt: bot.createdAt } });
  }
  // WhatsApp customer conversation: send what was typed to the customer's WhatsApp.
  if (c.startsWith("wa-") && !parentId && data.kind !== "TEXT") {
    await db.message.create({ data: { conversationId: c, userId: "system", kind: "SYSTEM", text: "Files and voice notes stay in Modo — only text messages are sent to WhatsApp." } });
  } else if (c.startsWith("wa-") && !parentId && text) {
    const r = await sendWA(c.startsWith("wa-g-") ? c.slice(5) + "@g.us" : c.slice(3), text).catch((e) => ({ ok: false, error: e.message }));
    if (!r.ok) await db.message.create({ data: { conversationId: c, userId: "system", kind: "SYSTEM", text: `⚠️ Not delivered on WhatsApp: ${r.error}${r.pinged ? " (we sent them a ping so they can reply)" : ""}` } });
  }
  return NextResponse.json((await shapeAll([m], s.uid))[0]);
}
