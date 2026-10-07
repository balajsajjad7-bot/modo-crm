// Modo bots: automatic checks that run on a tick (every open Modo calls /api/bots/tick every couple of
// minutes, plus the GitHub heartbeat). They post to the admins-only #modo-bot channel, message agents in
// their own "Modo bot" inbox, send phone alerts, and mirror admin alerts to WhatsApp.
// Every alert has a fixed key (used as the message id), so nothing is ever posted twice.
import { db } from "./db";
import { sendPush } from "./push";
import { resolveShift, shiftBounds } from "./payroll";
import { alertAdminsWA } from "./whatsapp";
import { EXTRA_BOTS, botConfig, saveBotConfig } from "./botsPlus";
import { once } from "./throttle";

export const BOT = "modo-bot";
let _ready = 0, _last = 0;

export async function ensureBotChannel() {
  if (Date.now() - _ready < 10 * 60000) return;
  await db.conversation.upsert({ where: { id: BOT }, update: {}, create: { id: BOT, name: "modo-bot", isGroup: true, isChannel: true, isPrivate: true, topic: "Modo bots: daily briefings, callbacks, sale checks, attendance — and ask me anything (type help)" } });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: BOT, userId: u.id })), skipDuplicates: true });
  _ready = Date.now();
}

const admins = async () => (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })).map((u) => u.id);

// Post once per key to #modo-bot (+ push + WhatsApp). Returns true if it was new.
export async function alert(key, text, { push = true, wa = true, urgent = false } = {}) {
  await ensureBotChannel();
  const id = ("bot-" + key).slice(0, 190);
  const r = await db.message.createMany({ data: [{ id, conversationId: BOT, userId: "modo-bot", kind: "TEXT", text: String(text).slice(0, 3900) }], skipDuplicates: true });
  if (!r.count) return false;
  await db.conversation.update({ where: { id: BOT }, data: { lastMessageAt: new Date() } });
  if (push) sendPush(await admins(), { title: "🤖 Modo bot", body: String(text).split("\n")[0].slice(0, 140), url: "/admin/chat", tag: "bot-" + key.split("-")[0], urgent }).catch(() => {});
  if (wa) alertAdminsWA("🤖 Modo bot\n" + text).catch(() => {});
  return true;
}

// The agent's own "Modo bot" inbox (a private conversation just for them).
export async function agentInbox(userId) {
  const id = "botdm-" + userId;
  await db.conversation.upsert({ where: { id }, update: {}, create: { id, name: "Modo bot 🤖", isGroup: true, members: { create: [{ userId }] } } });
  return id;
}
export async function tellAgent(key, userId, text, { push = true } = {}) {
  const conv = await agentInbox(userId);
  const id = ("botdm-" + key).slice(0, 190);
  const r = await db.message.createMany({ data: [{ id, conversationId: conv, userId: "modo-bot", kind: "TEXT", text: String(text).slice(0, 3900) }], skipDuplicates: true });
  if (!r.count) return false;
  await db.conversation.update({ where: { id: conv }, data: { lastMessageAt: new Date() } });
  if (push) sendPush([userId], { title: "🤖 Modo bot", body: String(text).split("\n")[0].slice(0, 140), url: "/agent/chat", tag: "botdm" }).catch(() => {});
  return true;
}

const mins = (ms) => Math.max(0, Math.round(ms / 60000));
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
const first = (n) => String(n || "").split(" ")[0];
const worksOn = (u, dow) => String(u.workDays || "").split(",").map(Number).includes(dow);
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

// The floor's main shift = the most common shift among active agents (for briefings).
function floorShift(agents) {
  const count = {};
  for (const a of agents) { const k = a.shiftStart + "|" + (a.shiftHours || 9); count[k] = (count[k] || 0) + 1; }
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "19:00|9";
  const [shiftStart, h] = top.split("|");
  return { shiftStart, shiftHours: Number(h), workDays: "0,1,2,3,4,5,6" };
}

// ───────────── 1. Daily briefing (start of shift + end of shift) ─────────────
async function briefingBot(ctx) {
  const { now, agents, settings } = ctx;
  if (!agents.length) return;
  const fs = floorShift(agents);
  const { shiftDate, dow } = resolveShift(fs, now);
  const { start, end } = shiftBounds(fs, shiftDate);
  const scheduled = agents.filter((a) => worksOn(a, dow));
  const att = await db.attendance.findMany({ where: { shiftDate, userId: { in: agents.map((a) => a.id) } } });
  const A = Object.fromEntries(att.map((x) => [x.userId, x]));
  const target = settings?.dailyTarget || 3;

  // Start-of-shift brief: 20 minutes in (until 3 hours in, so a late tick still sends it)
  if (now - start >= 20 * 60000 && now - start < 3 * 3600000) {
    const late = att.filter((x) => x.lateSeconds > 60).map((x) => `${first(agents.find((a) => a.id === x.userId)?.name)} (${hm(Math.round(x.lateSeconds / 60))})`);
    const missing = scheduled.filter((a) => !A[a.id]).map((a) => first(a.name));
    const yStart = new Date(start.getTime() - 24 * 3600000);
    const ySales = await db.sale.findMany({ where: { createdAt: { gte: yStart, lt: start }, status: { not: "REJECTED" } }, select: { userId: true } });
    const by = {}; ySales.forEach((s) => (by[s.userId] = (by[s.userId] || 0) + 1));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    const due = await db.task.count({ where: { done: false, dueAt: { gte: start, lt: end } } });
    const overdue = await db.task.count({ where: { done: false, dueAt: { lt: start } } });
    const pk = await db.sale.groupBy({ by: ["upsStatus"], where: { upsStatus: { in: ["out_for_delivery", "exception"] } }, _count: { _all: true } }).catch(() => []);
    const ofd = pk.find((x) => x.upsStatus === "out_for_delivery")?._count._all || 0, exc = pk.find((x) => x.upsStatus === "exception")?._count._all || 0;
    await alert(`brief-start-${shiftDate}`, [
      `☀️ Start-of-shift briefing · ${shiftDate}`,
      `👥 In: ${att.length} of ${scheduled.length} scheduled${missing.length ? ` · not in yet: ${missing.join(", ")}` : ""}`,
      late.length ? `⏰ Late: ${late.join(", ")}` : "⏰ Nobody late 👏",
      `💰 Last shift: ${ySales.length} sale${ySales.length === 1 ? "" : "s"}${top ? ` · top: ${first(agents.find((a) => a.id === top[0])?.name)} (${top[1]})` : ""}`,
      `🎯 Target today: ${target} per agent`,
      `📞 Callbacks due this shift: ${due}${overdue ? ` · ⚠️ ${overdue} overdue from before` : ""}`,
      ofd || exc ? `📦 Packages: ${ofd} out for delivery${exc ? ` · ⚠️ ${exc} with a problem` : ""}` : null,
    ].filter(Boolean).join("\n"));
  }

  // End-of-shift report: at shift end (until 3 hours after)
  if (now - end >= 0 && now - end < 3 * 3600000) {
    const sales = await db.sale.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { userId: true, status: true, amount: true } });
    const by = {}; sales.filter((s) => s.status !== "REJECTED").forEach((s) => (by[s.userId] = (by[s.userId] || 0) + 1));
    const rows = scheduled.map((a) => ({ a, n: by[a.id] || 0 })).sort((x, y) => y.n - x.n);
    const hit = rows.filter((r) => r.n >= target).length;
    const brk = await db.breakLog.findMany({ where: { shiftDate, userId: { in: agents.map((a) => a.id) } } });
    const bt = {}; brk.forEach((b) => (bt[b.userId] = (bt[b.userId] || 0) + ((b.end ? new Date(b.end) : now) - new Date(b.start))));
    const allow = (settings?.breakAllowance || 60) * 60000;
    const overBreak = Object.entries(bt).filter(([, ms]) => ms > allow).map(([id, ms]) => `${first(agents.find((a) => a.id === id)?.name)} (+${hm(mins(ms - allow))})`);
    const openCb = await db.task.count({ where: { done: false, dueAt: { lt: end } } });
    const total = sales.filter((s) => s.status !== "REJECTED").length;
    await alert(`brief-end-${shiftDate}`, [
      `🌙 End-of-shift report · ${shiftDate}`,
      `💰 Sales: ${total} (${sales.filter((s) => s.status === "VERIFIED").length} active, ${sales.filter((s) => s.status === "NEW").length} waiting for review)`,
      `🎯 ${hit} of ${scheduled.length} agents hit the target of ${target}`,
      rows.length ? "🏆 " + rows.slice(0, 8).map((r) => `${first(r.a.name)} ${r.n}`).join(" · ") : null,
      rows.filter((r) => r.n === 0 && A[r.a.id]).length ? `🔍 No sales: ${rows.filter((r) => r.n === 0 && A[r.a.id]).map((r) => first(r.a.name)).join(", ")}` : null,
      overBreak.length ? `☕ Over break allowance: ${overBreak.join(", ")}` : null,
      openCb ? `📞 ${openCb} callback${openCb === 1 ? "" : "s"} still open` : "📞 All callbacks done",
    ].filter(Boolean).join("\n"));
  }
}

// ───────────── 2. Callbacks & follow-ups ─────────────
async function callbackBot(ctx) {
  const { now, agents } = ctx;
  const soon = await db.task.findMany({ where: { done: false, dueAt: { gte: new Date(now - 5 * 60000), lte: new Date(now.getTime() + 10 * 60000) } }, take: 50 });
  for (const t of soon) {
    await tellAgent(`cb-soon-${t.id}`, t.assigneeId, `📞 Callback ${t.dueAt > now ? "in " + hm(mins(t.dueAt - now)) : "now"}: ${t.title}${t.notes ? "\n" + String(t.notes).slice(0, 300) : ""}`);
  }
  const over = await db.task.findMany({ where: { done: false, dueAt: { lt: new Date(now - 30 * 60000), gte: new Date(now - 7 * 24 * 3600000) } }, take: 50, orderBy: { dueAt: "asc" } });
  for (const t of over) {
    const who = agents.find((a) => a.id === t.assigneeId);
    await tellAgent(`cb-over-${t.id}`, t.assigneeId, `⚠️ Overdue callback (${hm(mins(now - t.dueAt))} late): ${t.title}. Call now or reschedule it in Tasks.`);
    await alert(`cb-over-${t.id}`, `📞 Overdue callback: ${t.title} — ${who ? who.name : "someone"}, ${hm(mins(now - t.dueAt))} late`, { wa: false });
  }
}

// ───────────── 3. Sales checker ─────────────
const SSN = /\b\d{3}-\d{2}-\d{4}\b/, CARD = /\b(?:\d[ -]?){12,18}\d\b/;
async function salesBot(ctx) {
  const { now, agents } = ctx;
  const fresh = await db.sale.findMany({ where: { createdAt: { gte: new Date(now - 24 * 3600000) }, status: { not: "REJECTED" } }, orderBy: { createdAt: "desc" }, take: 40,
    select: { id: true, userId: true, receipt: true, orderNumber: true, customer: true, phone: true, address: true, zip: true, device: true, raw: true, notes: true, createdAt: true } });
  for (const s of fresh) {
    if (now - s.createdAt < 2 * 60000) continue; // give the agent a moment to finish editing
    const issues = [];
    if (!s.customer) issues.push("customer name is missing");
    const ph = String(s.phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (!ph) issues.push("phone number is missing"); else if (ph.length !== 10) issues.push(`phone "${s.phone}" isn't a 10-digit US number`);
    if (!s.address) issues.push("address is missing");
    if (s.zip && !/^\d{5}(-\d{4})?$/.test(String(s.zip).trim())) issues.push(`ZIP "${s.zip}" doesn't look right`);
    if (!s.orderNumber) issues.push("order number is missing");
    if (!s.device) issues.push("device is missing");
    const text = (s.raw || "") + " " + (s.notes || "");
    const risky = [];
    if (SSN.test(text)) risky.push("an SSN is written in the sale — remove it");
    if (CARD.test(text.replace(/\b\d{10,11}\b/g, ""))) risky.push("what looks like a card number is written in the sale — remove it");
    const or = [];
    if (ph.length === 10) or.push({ phone: { contains: ph.slice(-10) } });
    if (s.orderNumber) or.push({ orderNumber: s.orderNumber });
    const dup = or.length ? await db.sale.findFirst({ where: { id: { not: s.id }, status: { not: "REJECTED" }, createdAt: { gte: new Date(now - 60 * 24 * 3600000) }, OR: or }, select: { orderNumber: true, receipt: true, customer: true, userId: true } }) : null;
    if (dup) issues.push(`possible duplicate of #${dup.orderNumber || dup.receipt}${dup.customer ? " (" + dup.customer + ")" : ""}`);
    const all = [...risky, ...issues];
    if (!all.length) continue;
    const tagS = `#${s.orderNumber || s.receipt}${s.customer ? " · " + s.customer : ""}`;
    const agent = agents.find((a) => a.id === s.userId);
    await tellAgent(`sale-${s.id}`, s.userId, `🧾 Please check your sale ${tagS}:\n${all.map((x) => "• " + x).join("\n")}\nFix it in Sales so it can be approved.`);
    await alert(`sale-${s.id}`, `🧾 Sale check ${tagS} by ${agent ? agent.name : "agent"}:\n${all.map((x) => "• " + x).join("\n")}`, { wa: risky.length > 0 || !!dup, urgent: risky.length > 0 });
  }
}

// ───────────── 4. Attendance & breaks ─────────────
async function attendanceBot(ctx) {
  const { now, agents, settings } = ctx;
  const allow = (settings?.breakAllowance || 60) * 60000;
  for (const a of agents) {
    const { shiftDate, dow } = resolveShift(a, now);
    if (!worksOn(a, dow)) continue;
    const { start, end } = shiftBounds(a, shiftDate);
    if (now < start || now > end) continue;
    const at = await db.attendance.findUnique({ where: { userId_shiftDate: { userId: a.id, shiftDate } } });
    if (!at) {
      if (now - start > 30 * 60000) {
        await alert(`noshow-${a.id}-${shiftDate}`, `🚫 ${a.name} hasn't clocked in — shift started ${hm(mins(now - start))} ago`);
        await tellAgent(`noshow-${a.id}-${shiftDate}`, a.id, `Your shift started ${hm(mins(now - start))} ago and you're not clocked in yet. Open Modo to clock in.`);
      }
      continue;
    }
    if (at.clockOut) continue;
    if (at.lateSeconds > Math.max(60, (a.graceMinutes || 0) * 60)) await alert(`late-${at.id}`, `⏰ ${a.name} clocked in ${hm(Math.round(at.lateSeconds / 60))} late`, { wa: false });
    const brks = await db.breakLog.findMany({ where: { userId: a.id, shiftDate } });
    const open = brks.find((b) => !b.end);
    if (open && now - new Date(open.start) > 30 * 60000) {
      await alert(`brklong-${open.id}`, `☕ ${a.name} has been on break for ${hm(mins(now - new Date(open.start)))}`);
      await tellAgent(`brklong-${open.id}`, a.id, `☕ You've been on break for ${hm(mins(now - new Date(open.start)))}. Please end your break when you're back.`);
    }
    const used = brks.reduce((t, b) => t + ((b.end ? new Date(b.end) : now) - new Date(b.start)), 0);
    if (used > allow) await alert(`brkover-${a.id}-${shiftDate}`, `☕ ${a.name} is over today's break allowance by ${hm(mins(used - allow))}`, { wa: false });
    if (!open && a.idleSince && now - new Date(a.idleSince) > 15 * 60000) {
      await alert(`idle-${a.id}-${new Date(a.idleSince).getTime()}`, `💤 ${a.name} has been idle for ${hm(mins(now - new Date(a.idleSince)))} while clocked in`, { wa: false });
    }
  }
}

export const BOTS = { briefing: briefingBot, callbacks: callbackBot, sales: salesBot, attendance: attendanceBot, ...EXTRA_BOTS };
// How often each bot needs to run (its messages are de-duplicated anyway; this just saves work).
const EVERY = { leaderboard: 10, followup: 360, contracts: 60, training: 120, welcome: 30, review: 15, packages: 30, quality: 10, pace: 5, clockout: 10 };

export async function runBots({ force = false } = {}) {
  if (!force && Date.now() - _last < 60000) return { ok: true, skipped: true };
  _last = Date.now();
  await ensureBotChannel();
  const now = new Date();
  const [agents, settings] = await Promise.all([
    db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true, name: true, shiftStart: true, shiftHours: true, workDays: true, graceMinutes: true, idleSince: true } }),
    db.setting.findUnique({ where: { id: "global" } }).catch(() => null),
  ]);
  const ctx = { now, agents, settings, alert, tellAgent };
  const cfg = await botConfig();
  const out = {};
  for (const [name, fn] of Object.entries(BOTS)) {
    if (cfg.off?.includes(name)) { out[name] = "off"; continue; }
    if (!force && EVERY[name] && !(await once("bot-" + name, EVERY[name] * 60000))) { out[name] = "waiting"; continue; }
    try { await fn(ctx); out[name] = "ok"; } catch (e) { out[name] = "error: " + String(e.message).slice(0, 120); }
  }
  // Remember the last run of each bot (for the Bots page).
  try { const runs = { ...(cfg.runs || {}) }; for (const [k, v] of Object.entries(out)) if (v !== "waiting") runs[k] = { at: now.toISOString(), result: v }; await saveBotConfig({ ...cfg, runs }); } catch {}
  return { ok: true, bots: out };
}
