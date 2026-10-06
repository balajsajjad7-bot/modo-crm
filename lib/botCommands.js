// Admin commands for the Modo bot — the same brain answers in Chat → #modo-bot and on WhatsApp.
import { db } from "./db";
import { askAI } from "./ai";
import { resolveShift, shiftBounds } from "./payroll";
import { handleUpsBot } from "./upsChatBot";
import { coachPads } from "./coach";
import { runBots } from "./bots";

const first = (n) => String(n || "").split(" ")[0];
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
const ONLINE_MS = 90000;

export const HELP = `🤖 Modo bot — what you can ask:
• sales — today's sales by agent
• online — who's working, on break or idle
• late — who came in late / hasn't clocked in
• callbacks — due and overdue callbacks
• brief — a briefing right now
• coach — notepad coaching for every agent
• 1Z999AA10123456784 #12345 — add tracking to a sale (same as #ups-bot)
• check — run all bots now
• anything else — ask Modo AI (it knows your team, sales and products)`;

async function todayWindow() {
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true, name: true, shiftStart: true, shiftHours: true, workDays: true, lastSeenAt: true, idleSince: true, status: true, padText: true, agentId: true } });
  const fs = agents[0] ? { shiftStart: mode(agents.map((a) => a.shiftStart)) || "19:00", shiftHours: mode(agents.map((a) => a.shiftHours)) || 9 } : { shiftStart: "19:00", shiftHours: 9 };
  const { shiftDate } = resolveShift(fs, new Date());
  const { start, end } = shiftBounds(fs, shiftDate);
  return { agents, shiftDate, start, end };
}
const mode = (arr) => { const c = {}; arr.forEach((x) => (c[x] = (c[x] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };

async function salesToday() {
  const { agents, start, shiftDate } = await todayWindow();
  const sales = await db.sale.findMany({ where: { createdAt: { gte: start } }, select: { userId: true, status: true, customer: true, orderNumber: true, device: true } });
  if (!sales.length) return `💰 No sales yet this shift (${shiftDate}).`;
  const by = {}; sales.filter((s) => s.status !== "REJECTED").forEach((s) => (by[s.userId] = (by[s.userId] || 0) + 1));
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${first(agents.find((a) => a.id === id)?.name) || "?"} ${n}`);
  return `💰 Sales this shift (${shiftDate}): ${sales.filter((s) => s.status !== "REJECTED").length}\n🏆 ${rows.join(" · ")}\n✅ Active ${sales.filter((s) => s.status === "VERIFIED").length} · ⏳ Waiting ${sales.filter((s) => s.status === "NEW").length} · ❌ Rejected ${sales.filter((s) => s.status === "REJECTED").length}`;
}

async function online() {
  const { agents, shiftDate } = await todayWindow();
  const open = await db.breakLog.findMany({ where: { end: null, userId: { in: agents.map((a) => a.id) } } });
  const onBreak = new Set(open.map((b) => b.userId));
  const now = Date.now();
  const on = agents.filter((a) => a.lastSeenAt && now - new Date(a.lastSeenAt) < ONLINE_MS);
  const line = (a) => `${first(a.name)}${onBreak.has(a.id) ? " ☕" : a.idleSince && now - new Date(a.idleSince) > 5 * 60000 ? " 💤" : ""}`;
  return `👥 Online now: ${on.length} of ${agents.length}\n${on.length ? on.map(line).join(", ") : "Nobody online"}\n☕ = on break · 💤 = idle (${shiftDate})`;
}

async function late() {
  const { agents } = await todayWindow();
  const now = new Date(); const lines = [];
  for (const a of agents) {
    const { shiftDate, dow } = resolveShift(a, now);
    if (!String(a.workDays || "").split(",").map(Number).includes(dow)) continue;
    const { start } = shiftBounds(a, shiftDate);
    if (now < start) continue;
    const at = await db.attendance.findUnique({ where: { userId_shiftDate: { userId: a.id, shiftDate } } });
    if (!at) lines.push(`🚫 ${a.name} — not clocked in (${hm(Math.round((now - start) / 60000))} since start)`);
    else if (at.lateSeconds > 60) lines.push(`⏰ ${a.name} — ${hm(Math.round(at.lateSeconds / 60))} late`);
  }
  return lines.length ? lines.join("\n") : "⏰ Everyone is on time 👏";
}

async function callbacks() {
  const now = new Date();
  const [due, over] = await Promise.all([
    db.task.findMany({ where: { done: false, dueAt: { gte: now, lte: new Date(now.getTime() + 4 * 3600000) } }, orderBy: { dueAt: "asc" }, take: 10 }),
    db.task.findMany({ where: { done: false, dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 10 }),
  ]);
  const ids = [...new Set([...due, ...over].map((t) => t.assigneeId))];
  const U = Object.fromEntries((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const f = (t) => `• ${t.title} — ${first(U[t.assigneeId]) || "?"} · ${new Date(t.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
  if (!due.length && !over.length) return "📞 No callbacks due in the next 4 hours, and none overdue.";
  return [over.length ? `⚠️ Overdue (${over.length}):\n${over.map(f).join("\n")}` : null, due.length ? `📞 Next 4 hours (${due.length}):\n${due.map(f).join("\n")}` : null].filter(Boolean).join("\n\n");
}

async function coachText() {
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true, name: true, agentId: true, padText: true } });
  const r = await coachPads(agents);
  if (r.empty) return "🧠 No notes in agents' notepads yet.";
  const out = [r.overview ? "🧠 " + r.overview : "🧠 Notepad coaching"];
  for (const a of r.agents || []) {
    out.push(`\n👤 ${a.agent}${a.summary ? " — " + a.summary : ""}`);
    for (const c of a.customers || []) out.push(`• ${c.customer}${c.mood ? " (" + c.mood + ")" : ""}: ${c.situation || ""}\n  Say: "${c.say || ""}"\n  Next: ${c.next || ""}${(c.flags || []).length ? "\n  ⚠️ " + c.flags.join("; ") : ""}`);
  }
  return out.join("\n").slice(0, 3800);
}

async function aiAnswer(text, user) {
  const facts = [await salesToday(), await online(), await late(), await callbacks()].join("\n\n");
  return askAI(`You are the Modo bot, an assistant for the admin of a US call center (agents in Pakistan). Answer briefly and practically in plain text (no markdown tables). Use the live floor data below when it helps; never invent numbers. If something needs an action in Modo, say where (e.g. Sales, Tasks, Settings).\n\nLIVE FLOOR DATA:\n${facts}`, String(text).slice(0, 1500), { maxTokens: 700 });
}

// Returns the reply text for one admin message.
export async function handleCommand(text, user) {
  const t = String(text || "").trim();
  const low = t.toLowerCase().replace(/[!?.]+$/, "");
  if (!t || /^(help|menu|commands|hi|hello|hey|salam|assalam.*)$/.test(low)) return HELP;
  if (/\b1Z[0-9A-Z]{16}\b/i.test(t) || /^(list|tracking)$/.test(low)) return handleUpsBot(/^tracking$/.test(low) ? "list" : t, user);
  if (/^(sales|sales today|today'?s sales|sale)$/.test(low)) return salesToday();
  if (/^(online|who'?s online|who is online|status|floor)$/.test(low)) return online();
  if (/^(late|lates|attendance|who'?s late|absent|no ?shows?)$/.test(low)) return late();
  if (/^(callbacks?|tasks?|follow ?ups?)$/.test(low)) return callbacks();
  if (/^(brief|briefing|report|summary)$/.test(low)) return [await salesToday(), await online(), await late(), await callbacks()].join("\n\n");
  if (/^(coach|notepads?|notes)$/.test(low)) return coachText();
  if (/^(check|run|run bots|check now)$/.test(low)) { const r = await runBots({ force: true }); return "🤖 Ran all bots: " + Object.entries(r.bots || {}).map(([k, v]) => `${k} ${v === "ok" ? "✅" : "⚠️ " + v}`).join(" · ") + "\nNew alerts (if any) are in #modo-bot."; }
  return aiAnswer(t, user);
}
