// Modo Agent — the admin's AI assistant that DOES things, from WhatsApp or Chat → #modo-bot.
// It uses the free AI already set up in Connectors (e.g. Groq) to turn a plain-language request into a plan of
// actions from a fixed, safe list, runs them, and replies with what it did. Anything that reaches a customer or
// changes a sale waits for the admin to answer YES.
import { db } from "./db";
import { askAI } from "./ai";
import { tellAgent } from "./bots";
import { sendPush } from "./push";
import { sendLinked } from "./walink";
import { setSaleStatus } from "./saleStatus";
import { handleUpsBot } from "./upsChatBot";
import { ensureEveryone } from "./chat";

const NEEDS_YES = ["set_sale_status", "whatsapp_customer", "message_all_agents"];
const pendingId = (uid) => "agent-pending-" + (uid || "admin");

const ACTIONS = `Actions you can use (JSON objects with "do" plus the fields shown):
- {"do":"message_agent","agent":"name or agent ID","text":"message"} — send an agent a message in their Modo inbox + phone alert
- {"do":"message_all_agents","text":"announcement"} — post in #general for everyone + phone alert
- {"do":"create_task","agent":"name/ID or \\"me\\"","title":"what to do","due":"ISO 8601 date-time with offset, or null","type":"callback|task|meeting","customer":"customer name or phone, or null"} — callbacks, follow-ups, reminders (use agent "me" for reminders to the admin)
- {"do":"set_sale_status","order":"order number, receipt or customer name","status":"active|not_active|new"}
- {"do":"add_tracking","order":"order number","tracking":"1Z… tracking number"}
- {"do":"find_customer","query":"name, phone or order number"} — look up a customer's sales and contact details
- {"do":"whatsapp_customer","to":"phone number or customer name","text":"message"} — send a WhatsApp from the business number
- {"do":"report","what":"sales|online|late|callbacks|brief|coach"} — live floor reports`;

const clean = (s, n = 1000) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const digits = (s) => String(s || "").replace(/\D/g, "");
const fmtWhen = (d) => new Date(d).toLocaleString("en-US", { timeZone: "Asia/Karachi", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PKT";

async function findAgent(q) {
  const s = clean(q, 80).toLowerCase(); if (!s) return null;
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true, name: true, agentId: true } });
  return agents.find((a) => String(a.agentId || "").toLowerCase() === s) || agents.find((a) => a.name.toLowerCase() === s)
    || agents.find((a) => a.name.toLowerCase().split(" ")[0] === s.split(" ")[0]) || agents.find((a) => a.name.toLowerCase().includes(s)) || null;
}
async function findSale(q) {
  const s = clean(q, 80); if (!s) return null;
  const d = digits(s);
  return (await db.sale.findFirst({ where: { OR: [{ orderNumber: { equals: s.replace(/^#/, ""), mode: "insensitive" } }, { receipt: { equals: s, mode: "insensitive" } }] }, orderBy: { createdAt: "desc" } }))
    || (d.length >= 10 ? await db.sale.findFirst({ where: { phone: { contains: d.slice(-10) } }, orderBy: { createdAt: "desc" } }) : null)
    || (await db.sale.findFirst({ where: { customer: { contains: s, mode: "insensitive" } }, orderBy: { createdAt: "desc" } }));
}
async function findContact(q) {
  const s = clean(q, 80); if (!s) return null;
  const d = digits(s);
  if (d.length >= 7) { const near = await db.contact.findMany({ where: { phone: { contains: d.slice(-7) } }, take: 20 }); const c = near.find((x) => digits(x.phone).endsWith(d.slice(-10))) || near[0]; if (c) return c; }
  return db.contact.findFirst({ where: { name: { contains: s, mode: "insensitive" } }, orderBy: { createdAt: "desc" } });
}
const STATUS = { active: "VERIFIED", not_active: "REJECTED", inactive: "REJECTED", new: "NEW" };

// Describe an action in one line (for the YES prompt and the result).
function describe(a) {
  switch (a.do) {
    case "set_sale_status": return `Mark sale ${a.order} as ${({ active: "Active", not_active: "Not active", new: "New" })[a.status] || a.status}`;
    case "whatsapp_customer": return `WhatsApp ${a.to}: “${clean(a.text, 300)}”`;
    case "message_all_agents": return `Announce to all agents: “${clean(a.text, 300)}”`;
    default: return a.do;
  }
}

async function run(a, user) {
  switch (a.do) {
    case "message_agent": {
      const ag = await findAgent(a.agent); if (!ag) return `❓ No agent called “${clean(a.agent, 40)}”.`;
      const text = clean(a.text, 1500); if (!text) return "❓ What should I tell them?";
      await tellAgent("agent-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ag.id, `📩 From ${user.name || "Admin"}: ${text}`);
      return `✅ Told ${ag.name}: “${text.slice(0, 120)}”`;
    }
    case "message_all_agents": {
      const text = clean(a.text, 1500); if (!text) return "❓ What should I announce?";
      await ensureEveryone();
      const from = user.uid && (await db.user.findUnique({ where: { id: user.uid }, select: { id: true } })) ? user.uid : "modo-bot";
      await db.message.create({ data: { conversationId: "everyone", userId: from, kind: "TEXT", text: `📣 ${text}` } });
      await db.conversation.update({ where: { id: "everyone" }, data: { lastMessageAt: new Date() } }).catch(() => {});
      const ids = (await db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true } })).map((u) => u.id);
      sendPush(ids, { title: "📣 Announcement", body: text.slice(0, 140), url: "/agent/chat", tag: "announce" }).catch(() => {});
      return `✅ Announced in #general to ${ids.length} agent(s).`;
    }
    case "create_task": {
      const me = !a.agent || /^(me|admin|myself)$/i.test(String(a.agent).trim());
      const ag = me ? null : await findAgent(a.agent);
      if (!me && !ag) return `❓ No agent called “${clean(a.agent, 40)}”.`;
      const assigneeId = me ? user.uid : ag.id;
      if (!assigneeId) return "❓ I couldn't tell who this task is for.";
      let due = a.due ? new Date(a.due) : null; if (due && isNaN(due)) due = null;
      const c = a.customer ? await findContact(a.customer) : null;
      const title = clean(a.title, 200) || "Follow up";
      await db.task.create({ data: { title, type: ["callback", "task", "meeting", "email"].includes(a.type) ? a.type : "task", dueAt: due, contactId: c?.id || null, assigneeId, createdById: user.uid || assigneeId, notes: "Created by Modo Agent from: " + clean(user._request, 300) } });
      if (ag) await tellAgent("task-" + Date.now().toString(36), ag.id, `🗓 New ${a.type === "callback" ? "callback" : "task"} from ${user.name || "Admin"}: ${title}${due ? " — due " + fmtWhen(due) : ""}${c ? ` (${c.name}${c.phone ? " " + c.phone : ""})` : ""}`);
      return `✅ ${a.type === "callback" ? "Callback" : "Task"} for ${me ? "you" : ag.name}: ${title}${due ? " — " + fmtWhen(due) : ""}${c ? ` · ${c.name}` : a.customer ? ` · (no customer “${clean(a.customer, 40)}” found, saved without link)` : ""}`;
    }
    case "set_sale_status": {
      const s = await findSale(a.order); if (!s) return `❓ No sale found for “${clean(a.order, 40)}”.`;
      const st = STATUS[String(a.status || "").toLowerCase().replace(/\s+/g, "_")]; if (!st) return "❓ Status must be active, not active or new.";
      await setSaleStatus(s.id, st, (user.name || "Admin") + " via Modo Agent");
      return `✅ Sale #${s.orderNumber || s.receipt} (${s.customer || "customer"}) is now ${st === "VERIFIED" ? "Active" : st === "REJECTED" ? "Not active" : "New"}.`;
    }
    case "add_tracking": return handleUpsBot(`${clean(a.tracking, 40)} #${clean(a.order, 40).replace(/^#/, "")}`, user);
    case "find_customer": {
      const q = clean(a.query, 80); const s = await findSale(q); const c = await findContact(q);
      if (!s && !c) return `🔎 Nothing found for “${q}”.`;
      const out = [];
      if (s) out.push(`🧾 Sale #${s.orderNumber || s.receipt} · ${s.customer || ""} · ${s.phone || ""} · ${s.device || ""} · ${s.status === "VERIFIED" ? "Active" : s.status === "REJECTED" ? "Not active" : "New"}${s.upsStatus ? " · UPS " + s.upsStatus.replace(/_/g, " ") : ""}${s.zip ? " · ZIP " + s.zip : ""}`);
      if (c) out.push(`👤 ${c.name}${c.phone ? " · " + c.phone : ""}${c.email ? " · " + c.email : ""}${c.address ? " · " + c.address : ""}`);
      return out.join("\n");
    }
    case "whatsapp_customer": {
      let to = digits(a.to);
      if (to.length < 10) { const c = await findContact(a.to); const s = c ? null : await findSale(a.to); to = digits(c?.phone || s?.phone); }
      if (to.length === 10) to = "1" + to; // US number without country code
      if (to.length < 11) return `❓ I couldn't find a phone number for “${clean(a.to, 40)}”.`;
      const text = clean(a.text, 2000); if (!text) return "❓ What should the message say?";
      const r = await sendLinked(to, text);
      return r.queued ? `✅ WhatsApp to +${to} queued (sends as soon as the relay is awake).` : `✅ WhatsApp sent to +${to}.`;
    }
    case "report": {
      const { handleCommand } = await import("./botCommands");
      return handleCommand(["sales", "online", "late", "callbacks", "brief", "coach"].includes(a.what) ? a.what : "brief", user);
    }
    default: return `❓ I can't do “${clean(a.do, 30)}” yet.`;
  }
}

async function runAll(actions, user) {
  const out = [];
  for (const a of actions.slice(0, 8)) { try { out.push(await run(a, user)); } catch (e) { out.push(`⚠️ ${a.do} failed: ${clean(e.message, 160)}`); } }
  return out.join("\n");
}

async function getPending(uid) { const b = await db.fileBlob.findUnique({ where: { id: pendingId(uid) } }).catch(() => null); if (!b) return null; try { const p = JSON.parse(Buffer.from(b.data).toString("utf8")); return Date.now() - p.at < 15 * 60000 ? p : null; } catch { return null; } }
export async function pendingAt(uid) { const p = await getPending(uid); return p ? p.at : 0; }
async function setPending(uid, p) {
  const id = pendingId(uid);
  if (!p) return db.fileBlob.deleteMany({ where: { id } });
  const data = Buffer.from(JSON.stringify(p), "utf8");
  await db.fileBlob.upsert({ where: { id }, update: { data, size: data.length }, create: { id, userId: "system", name: id, mime: "application/json", size: data.length, data } });
}

// Returns a reply string, or null when the request is just a question (the caller answers it with Modo AI).
export async function runAgent(text, user = {}) {
  const t = String(text || "").trim(); const low = t.toLowerCase().replace(/[!.]+$/, "");
  // YES / NO for a waiting action
  if (/^(yes|y|ok|okay|confirm|haan|han|ji|do it|send it|go)$/.test(low)) {
    const p = await getPending(user.uid); if (!p) return null;
    await setPending(user.uid, null);
    return "🤖 Done:\n" + (await runAll(p.actions, { ...user, _request: p.request }));
  }
  if (/^(no|n|cancel|stop|nahi|don'?t)$/.test(low)) { const p = await getPending(user.uid); if (!p) return null; await setPending(user.uid, null); return "👍 Cancelled — nothing was done."; }

  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, select: { name: true, agentId: true }, orderBy: { name: "asc" } });
  const now = new Date();
  const plan = await askAI(`You are Modo Agent, the admin's assistant inside Modo (a US call-center CRM; the team works from Pakistan on US hours).
Turn the admin's message into actions. Reply with JSON only: {"actions":[ ... ], "question": "only if you truly need one missing detail, else empty"}.
If the message is just a question or chat (not asking you to do something), return {"actions":[]}.
Never invent order numbers, phone numbers or names — use exactly what the admin wrote. Times: the admin means Pakistan time (PKT, UTC+5) unless they say ET/CT/PT or "customer's time".
Now: ${now.toISOString()} (UTC) = ${now.toLocaleString("en-US", { timeZone: "Asia/Karachi" })} PKT = ${now.toLocaleString("en-US", { timeZone: "America/New_York" })} ET.
Agents: ${agents.map((a) => `${a.name}${a.agentId ? " (" + a.agentId + ")" : ""}`).join(", ") || "none"}.
${ACTIONS}`, t, { json: true, maxTokens: 700, knowledge: false });
  const actions = Array.isArray(plan?.actions) ? plan.actions.filter((a) => a && typeof a.do === "string") : [];
  if (!actions.length) return plan?.question ? "❓ " + clean(plan.question, 300) : null;
  const sensitive = actions.filter((a) => NEEDS_YES.includes(a.do));
  if (sensitive.length) {
    // Safe ones run now; the rest wait for YES.
    const now1 = actions.filter((a) => !NEEDS_YES.includes(a.do));
    const done = now1.length ? (await runAll(now1, { ...user, _request: t })) + "\n\n" : "";
    await setPending(user.uid, { actions: sensitive, request: t, at: Date.now() });
    return `${done}🤖 Please confirm:\n${sensitive.map((a) => "• " + describe(a)).join("\n")}\nReply YES to do it, or NO to cancel.`;
  }
  return "🤖 " + (await runAll(actions, { ...user, _request: t }));
}
