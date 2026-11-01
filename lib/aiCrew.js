// AI crew: five AI teammates per campaign who work the night shift (9 PM–6 AM Pakistan time) inside Modo.
// They're real Modo accounts with the AI role, so they show up in Chat (online while on shift, an AI badge in their
// name) but never sign in, earn salary, or appear in attendance, payroll, targets or leaderboards (those only count
// AGENT accounts). On every bot tick during the shift they:
//   • answer agents' questions in #ai-desk (and in direct messages to any crew member)
//   • answer WhatsApp customers who are waiting, inside your WhatsApp rules, always saying they're an AI assistant
//   • read every new sale and flag anything that doesn't add up (to you, in Bots → AI crew)
//   • post a callback digest mid-shift, and a shift report when the shift ends.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, currentOrg } from "./db";

export const DESK = "ai-desk";
export const TZ = "Asia/Karachi";
export const SHIFT = { start: 21, end: 6 }; // 9 PM → 6 AM PKT

// The five jobs on each campaign's crew.
export const ROLES = [
  { key: "desk", title: "customer chat desk" },
  { key: "helper", title: "agent helper" },
  { key: "checker", title: "sale checker" },
  { key: "followup", title: "follow-ups" },
  { key: "lead", title: "shift lead" },
];
const NAMES = ["Ava", "Noah", "Mia", "Liam", "Zara", "Ethan", "Sofia", "Omar", "Leah", "Ryan", "Nora", "Adam", "Iris", "Owen", "Hana", "Jude", "Maya", "Sami", "Elle", "Theo"];

// Pakistan-time clock: { hour, minute, onShift, shiftDate } — shiftDate is the evening the shift started.
export function pkShift(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24, minute = Number(p.minute);
  const today = `${p.year}-${p.month}-${p.day}`;
  const onShift = hour >= SHIFT.start || hour < SHIFT.end;
  let shiftDate = today;
  if (hour < 12) { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); shiftDate = d.toISOString().slice(0, 10); } // before noon = last night's shift
  return { hour, minute, onShift, shiftDate };
}

// "Budget Ease" → "BE", "US Campaign" → "USC", "AT&T" → "ATT"
export function campaignCode(name) {
  const words = String(name || "").toUpperCase().replace(/&/g, "").split(/[^A-Z0-9]+/).filter(Boolean);
  if (!words.length) return "GEN";
  if (words.length === 1) return words[0].slice(0, 4);
  return words.map((w) => w[0]).join("").slice(0, 4);
}

// The crew accounts Modo keeps for these campaigns (stable IDs, so renames by the admin stick).
export function crewRoster(campaigns) {
  const out = []; const used = new Set();
  campaigns.forEach((c, ci) => {
    let code = campaignCode(c.name); while (used.has(code)) code += ci; used.add(code);
    ROLES.forEach((r, ri) => {
      const first = NAMES[(ci * ROLES.length + ri) % NAMES.length];
      out.push({ agentId: `AI-${code}-${ri + 1}`, name: `${first} (AI) · ${c.name}`, first, role: r.key, title: r.title, campaignId: c.id, campaign: c.name });
    });
  });
  return out;
}

const firstName = (n) => String(n || "").split(/[\s(]/)[0];
const roleOf = (u) => ROLES[(Number(String(u.agentId).split("-").pop()) || 1) - 1]?.key || "helper";

// ── State kept between ticks (what's been reviewed, which messages were posted) ──
const STATE = "ai-crew-state";
async function loadState() {
  const b = await db.fileBlob.findUnique({ where: { id: STATE } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : {}; } catch { return {}; }
}
async function saveState(s) {
  s.sales = (s.sales || []).slice(-400); s.flags = (s.flags || []).slice(-400);
  const data = Buffer.from(JSON.stringify(s), "utf8");
  await db.fileBlob.upsert({ where: { id: STATE }, update: { data, size: data.length }, create: { id: STATE, userId: "system", name: STATE, mime: "application/json", size: data.length, data } });
}

// Create any missing crew accounts and the #ai-desk channel. Safe to run every tick.
export async function ensureCrew({ force = false } = {}) {
  if (currentOrg()) return []; // the crew lives in your own Modo only
  const { once } = await import("./throttle");
  if (!force && !(await once("ai-crew-ensure", 30 * 60000))) return null;
  const campaigns = await db.campaign.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const list = crewRoster(campaigns.length ? campaigns : []);
  for (const m of list) {
    const exists = await db.user.findUnique({ where: { agentId: m.agentId }, select: { id: true } });
    if (exists) continue;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10); // nobody can sign in as the crew
    await db.user.create({ data: { agentId: m.agentId, passwordHash, role: "AI", name: m.name, campaignId: m.campaignId, shiftStart: "21:00", shiftHours: 9, workDays: "0,1,2,3,4,5,6", baseSalary: 0, active: true, status: "away" } });
  }
  await db.conversation.upsert({
    where: { id: DESK },
    update: {},
    create: { id: DESK, name: DESK, isGroup: true, isChannel: true, topic: "Ask the AI crew anything — pitches, objections, product facts. On shift 9 PM–6 AM (PKT). You can also message any crew member directly." },
  });
  const people = await db.user.findMany({ where: { active: true }, select: { id: true } });
  await db.convMember.createMany({ data: people.map((u) => ({ conversationId: DESK, userId: u.id })), skipDuplicates: true });
  return list;
}

async function post(conversationId, userId, text, { id, parentId } = {}) {
  const r = await db.message.createMany({ data: [{ id: id ? String(id).slice(0, 190) : undefined, conversationId, userId, kind: "TEXT", text: String(text).slice(0, 3900), parentId: parentId || null }], skipDuplicates: true });
  if (r.count) await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }).catch(() => {});
  return r.count > 0;
}

const SYSTEM_IDS = new Set(["modo-bot", "system", "wa-me"]);
const isHuman = (uid, crewIds) => uid && !crewIds.has(uid) && !SYSTEM_IDS.has(uid) && !String(uid).startsWith("wa:");

function helperPrompt(me, company, campaign) {
  return `You are ${firstName(me.name)}, an AI teammate on the ${campaign || company} night shift at ${company}, working inside the team's CRM chat. A human sales/support agent is asking you for help.
Answer like a sharp, friendly senior agent: short and practical (2–6 lines), with ready-to-say lines in quotes when useful. Plain American English.
Use only the company knowledge you're given for prices, offers and policies — if it isn't there, say so and suggest asking the admin. Never invent discounts or gifts.
Use campaign names exactly as given. Never ask for or repeat card numbers, SSNs, PINs or passwords. If someone asks whether you're human, say you're an AI teammate.`;
}

// ── 1) Agents asking in #ai-desk (threads) and in direct messages to a crew member ──
async function answerAgents({ crew, crewIds, now, company, askAI, budget }) {
  let done = 0;
  const since = new Date(now - 6 * 3600000);
  const helpers = crew.filter((u) => roleOf(u) === "helper");
  const pickFor = async (uid) => {
    const asker = await db.user.findUnique({ where: { id: uid }, select: { campaignId: true } }).catch(() => null);
    return helpers.find((h) => h.campaignId === asker?.campaignId) || helpers[0] || crew[0];
  };
  const camp = async (id) => (id ? (await db.campaign.findUnique({ where: { id }, select: { name: true } }).catch(() => null))?.name : "") || "";

  // #ai-desk: top-level questions without a crew reply yet
  const qs = await db.message.findMany({ where: { conversationId: DESK, parentId: null, deletedAt: null, kind: "TEXT", createdAt: { gte: since, lte: new Date(now - 15000) } }, orderBy: { createdAt: "asc" }, take: 20 });
  for (const q of qs) {
    if (done >= 2 || Date.now() > budget) break;
    if (!isHuman(q.userId, crewIds) || !String(q.text || "").trim()) continue;
    if (await db.message.findFirst({ where: { parentId: q.id, userId: { in: [...crewIds] } }, select: { id: true } })) continue;
    const me = await pickFor(q.userId);
    const answer = await askAI(helperPrompt(me, company, await camp(me.campaignId)), String(q.text).slice(0, 1500), { maxTokens: 450, campaignId: me.campaignId || "" }).catch(() => "");
    if (!answer) break; // AI unavailable — try next tick
    await post(DESK, me.id, answer, { id: "crewa-" + q.id, parentId: q.id });
    done++;
  }

  // Direct messages: 1:1 chats that include a crew member, where a human spoke last
  const mems = await db.convMember.findMany({ where: { userId: { in: [...crewIds] } }, select: { conversationId: true, userId: true } });
  const convIds = [...new Set(mems.map((m) => m.conversationId))].filter((c) => c !== DESK && c !== "everyone");
  if (!convIds.length) return done;
  const convs = await db.conversation.findMany({ where: { id: { in: convIds }, isChannel: false, lastMessageAt: { gte: since } }, select: { id: true } });
  for (const c of convs) {
    if (done >= 3 || Date.now() > budget) break;
    const memberCount = await db.convMember.count({ where: { conversationId: c.id } });
    if (memberCount > 2) continue; // only real 1:1 chats
    const last = await db.message.findFirst({ where: { conversationId: c.id, deletedAt: null, parentId: null }, orderBy: { createdAt: "desc" } });
    if (!last || !isHuman(last.userId, crewIds) || now - last.createdAt < 15000 || !String(last.text || "").trim()) continue;
    const me = crew.find((u) => u.id === mems.find((m) => m.conversationId === c.id && crewIds.has(m.userId))?.userId);
    if (!me) continue;
    const hist = await db.message.findMany({ where: { conversationId: c.id, deletedAt: null, parentId: null, kind: "TEXT" }, orderBy: { createdAt: "desc" }, take: 8 });
    const turns = hist.reverse().map((m) => ({ role: crewIds.has(m.userId) ? "assistant" : "user", content: String(m.text || "").slice(0, 1200) }));
    const answer = await askAI(helperPrompt(me, company, await camp(me.campaignId)), turns, { maxTokens: 450, campaignId: me.campaignId || "" }).catch(() => "");
    if (!answer) break;
    await post(c.id, me.id, answer, { id: "crewd-" + last.id });
    done++;
  }
  return done;
}

// ── 2) WhatsApp customers waiting for a reply ──
async function answerCustomers({ crew, now, company, askAI, budget }) {
  const { replySettings, rulesPrompt, stripLinks, hasLink, sendToCustomer, dropDraft } = await import("./waReply");
  const rules = await replySettings();
  if (rules.mode === "off") return 0; // you chose "only the team replies"
  const desk = crew.filter((u) => roleOf(u) === "desk");
  if (!desk.length) return 0;
  const convs = await db.conversation.findMany({ where: { id: { startsWith: "wa-" }, NOT: { id: { startsWith: "wa-g-" } }, lastMessageAt: { gte: new Date(now - 12 * 3600000), lte: new Date(now - 3 * 60000) } }, orderBy: { lastMessageAt: "asc" }, take: 15, select: { id: true } });
  let done = 0;
  for (const [i, c] of convs.entries()) {
    if (done >= 2 || Date.now() > budget) break;
    const last = await db.message.findFirst({ where: { conversationId: c.id, deletedAt: null }, orderBy: { createdAt: "desc" } });
    if (!last || !String(last.userId).startsWith("wa:") || now - last.createdAt < 3 * 60000) continue; // only when the customer spoke last
    const me = desk[i % desk.length];
    const hist = await db.message.findMany({ where: { conversationId: c.id, deletedAt: null, kind: "TEXT" }, orderBy: { createdAt: "desc" }, take: 10 });
    const turns = hist.reverse().map((m) => ({ role: String(m.userId).startsWith("wa:") ? "user" : "assistant", content: String(m.text || "").slice(0, 800) }));
    const sys = `You are ${firstName(me.name)}, the virtual assistant (an AI) for ${company}, replying on WhatsApp to a customer overnight while the team is busy. Be warm, honest and short (1–3 sentences). Use only the company's approved info. If you can't fully help, say a team member will follow up. If asked, say plainly that you're an AI assistant.` + rulesPrompt(rules);
    let text = await askAI(sys, turns, { maxTokens: 250 }).catch(() => "");
    if (!text) break;
    if (!rules.allowLinks && hasLink(text)) text = stripLinks(text);
    if (!text.trim()) continue;
    text = `${text.trim()}\n— ${firstName(me.name)}, ${company} virtual assistant (AI)`;
    await sendToCustomer(c.id, text, me.id);
    await dropDraft((d) => d.conv === c.id).catch(() => {});
    done++;
  }
  return done;
}

// ── 3) Read each new sale and flag anything that doesn't add up ──
async function checkSales({ crew, now, state, askAI, alert, budget }) {
  const checkers = crew.filter((u) => roleOf(u) === "checker");
  if (!checkers.length) return 0;
  const seen = new Set(state.sales || []);
  const fresh = await db.sale.findMany({ where: { createdAt: { gte: new Date(now - 12 * 3600000), lte: new Date(now - 5 * 60000) }, status: { not: "REJECTED" } }, orderBy: { createdAt: "asc" }, take: 30,
    select: { id: true, receipt: true, userId: true, campaignId: true, raw: true, customer: true, phone: true, address: true, zip: true, device: true, storage: true, orderNumber: true, billBefore: true, billAfter: true, discountPct: true, lines: true, saleType: true } });
  let done = 0;
  for (const s of fresh) {
    if (seen.has(s.id)) continue;
    if (done >= 1 || Date.now() > budget) break;
    const me = checkers.find((u) => u.campaignId === s.campaignId) || checkers[0];
    const { raw, ...fields } = s;
    const out = await askAI(
      `You are a careful sale checker for a US telecom/utility savings call center. Compare the agent's pasted sale text with the saved fields. Only flag real problems a human should fix: details that contradict each other (name, phone, address, ZIP, device, storage, lines, bill amounts), a discount or bill that doesn't make sense, or anything that looks like a card number or SSN. Missing fields are already checked elsewhere — ignore them. Reply as JSON: {"issues": ["short plain sentence", ...]} — an empty list if it all adds up.`,
      `Saved fields: ${JSON.stringify(fields)}\n\nPasted text:\n${String(raw || "").slice(0, 3000)}`,
      { json: true, maxTokens: 300, knowledge: false },
    ).catch(() => undefined);
    if (out === undefined) break; // AI unavailable — try next tick
    let issues = [];
    try { issues = (typeof out === "string" ? JSON.parse(out) : out).issues || []; } catch {}
    issues = issues.filter((x) => typeof x === "string" && x.trim()).slice(0, 5);
    seen.add(s.id); state.sales = [...seen];
    if (issues.length) {
      state.flags = [...(state.flags || []), s.id];
      const agent = await db.user.findUnique({ where: { id: s.userId }, select: { name: true } }).catch(() => null);
      await alert(`crew-sale-${s.id}`, `🔎 ${firstName(me.name)} (AI) checked sale ${s.receipt}${agent ? " by " + agent.name : ""}:\n• ${issues.join("\n• ")}`, { wa: false, push: false });
    }
    done++;
  }
  return done;
}

// ── 4) Mid-shift callback digest in #ai-desk ──
async function followups({ crew, now, state, shiftDate, hour }) {
  if (state.digest === shiftDate || !(hour >= 0 && hour < SHIFT.end)) return 0; // once per shift, after midnight
  const me = crew.find((u) => roleOf(u) === "followup") || crew[0];
  const tasks = await db.task.findMany({ where: { done: false, dueAt: { lte: new Date(now.getTime() + 6 * 3600000), gte: new Date(now - 7 * 24 * 3600000) } }, select: { assigneeId: true, dueAt: true }, take: 500 });
  state.digest = shiftDate;
  if (!tasks.length) { await post(DESK, me.id, "📞 Callback check: nothing due for the rest of the shift and nothing overdue. Nice work, team.", { id: `crew-digest-${shiftDate}` }); return 1; }
  const names = Object.fromEntries((await db.user.findMany({ where: { id: { in: [...new Set(tasks.map((t) => t.assigneeId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const per = {};
  for (const t of tasks) { const k = names[t.assigneeId] || "Unassigned"; per[k] = per[k] || { over: 0, due: 0 }; t.dueAt < now ? per[k].over++ : per[k].due++; }
  const lines = Object.entries(per).sort((a, b) => b[1].over - a[1].over).map(([n, v]) => `• ${n}: ${v.over ? v.over + " overdue" : ""}${v.over && v.due ? ", " : ""}${v.due ? v.due + " due before 6 AM" : ""}`);
  await post(DESK, me.id, `📞 Callback check for tonight:\n${lines.join("\n")}\nOpen Tasks to call them back or reschedule.`, { id: `crew-digest-${shiftDate}` });
  return 1;
}

// ── 5) Shift report when the shift ends ──
async function shiftReport({ crew, crewIds, state, shiftDate, now, alert }) {
  if (state.report === shiftDate) return;
  const start = new Date(`${shiftDate}T16:00:00Z`); // 9 PM PKT = 16:00 UTC
  const end = new Date(start.getTime() + 9 * 3600000);
  const ids = [...crewIds];
  const [desk, dms, wa, sales] = await Promise.all([
    db.message.count({ where: { conversationId: DESK, userId: { in: ids }, parentId: { not: null }, createdAt: { gte: start, lte: end } } }),
    db.message.count({ where: { id: { startsWith: "crewd-" }, createdAt: { gte: start, lte: end } } }),
    db.message.count({ where: { conversationId: { startsWith: "wa-" }, userId: { in: ids }, createdAt: { gte: start, lte: end } } }),
    db.sale.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { id: true, campaignId: true } }),
  ]);
  const flagged = sales.filter((s) => (state.flags || []).includes(s.id)).length;
  const reviewed = sales.filter((s) => (state.sales || []).includes(s.id)).length;
  const camps = Object.fromEntries((await db.campaign.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const byCamp = {}; for (const s of sales) { const k = camps[s.campaignId] || "Other"; byCamp[k] = (byCamp[k] || 0) + 1; }
  const overdue = await db.task.count({ where: { done: false, dueAt: { lt: now, gte: new Date(now - 7 * 24 * 3600000) } } });
  const lead = crew.find((u) => roleOf(u) === "lead") || crew[0];
  const text = `🌙 AI crew shift report — night of ${shiftDate} (9 PM–6 AM PKT)\n` +
    `• Agent questions answered: ${desk + dms}\n• WhatsApp customers answered: ${wa}\n` +
    `• Sales tonight: ${sales.length}${sales.length ? " (" + Object.entries(byCamp).map(([k, v]) => `${k} ${v}`).join(", ") + ")" : ""} — ${reviewed} checked, ${flagged} flagged\n` +
    `• Callbacks still overdue: ${overdue}\n— ${firstName(lead.name)} (AI), shift lead`;
  await alert(`crew-report-${shiftDate}`, text, { wa: true, push: true });
  await post(DESK, lead.id, `🔴 Clocking out. ${text.split("\n").slice(1, 4).join(" ")}`, { id: `crew-out-${shiftDate}` });
  state.report = shiftDate;
}

// The bot: runs on every Modo tick.
export async function crewBot({ now = new Date(), alert }) {
  if (currentOrg()) return;
  await ensureCrew();
  const crew = await db.user.findMany({ where: { role: "AI", active: true }, select: { id: true, name: true, agentId: true, campaignId: true, status: true } });
  if (!crew.length) return;
  const crewIds = new Set(crew.map((u) => u.id));
  const { hour, onShift, shiftDate } = pkShift(now);
  const state = await loadState();
  const { companyName } = await import("./company");
  const company = await companyName().catch(() => "our company");

  if (!onShift) {
    if (crew.some((u) => u.status !== "away")) await db.user.updateMany({ where: { role: "AI" }, data: { status: "away", statusAt: now } });
    if (hour < 12) await shiftReport({ crew, crewIds, state, shiftDate, now, alert });
    await saveState(state);
    return;
  }

  // On shift: online in Chat, and say hello once a night.
  // lastSeenAt a few minutes ahead keeps them "online" between ticks.
  await db.user.updateMany({ where: { role: "AI", active: true }, data: { status: "available", lastSeenAt: new Date(now.getTime() + 3 * 60000), idleSince: null, ...(crew.some((u) => u.status !== "available") ? { statusAt: now } : {}) } });
  if (state.clockIn !== shiftDate) {
    const lead = crew.find((u) => roleOf(u) === "lead") || crew[0];
    await post(DESK, lead.id, `🟢 AI crew clocked in for tonight (${crew.length} on shift, 9 PM–6 AM PKT). Ask here anytime — pitches, objections, product facts — or message any of us directly.`, { id: `crew-in-${shiftDate}` });
    state.clockIn = shiftDate;
  }

  const { askAI } = await import("./ai");
  const budget = Date.now() + 8000; // stay well inside the host's request time limit; the rest waits for the next tick
  const ctx = { crew, crewIds, now, company, askAI, alert, state, shiftDate, hour, budget };
  try {
    await answerAgents(ctx);
    await answerCustomers(ctx);
    await checkSales(ctx);
    await followups(ctx);
  } finally { await saveState(state); }
}
