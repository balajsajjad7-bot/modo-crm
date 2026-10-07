// Modo bot → #notepad-coach: a private chat channel for admins. Whenever an agent's notepad changes, the bot
// summarises it and posts, per customer, what to say and how to engage them. Runs on a tick (every open Modo
// calls it every few minutes, plus a GitHub heartbeat), like the UPS bot.
import crypto from "crypto";
import { db } from "./db";
import { askAI } from "./ai";
import { sendPush } from "./push";

export const COACH = "notepad-coach";
const GAP_MIN = 10;          // at most one coaching post per agent every 10 minutes
let _ready = 0, _errAt = 0;

export async function ensureCoach() {
  if (Date.now() - _ready < 10 * 60000) return;
  await db.conversation.upsert({ where: { id: COACH }, update: {}, create: { id: COACH, name: "notepad-coach", isGroup: true, isChannel: true, isPrivate: true, topic: "Modo bot reads agents' notepads and tells you what to say to each customer" } });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: COACH, userId: u.id })), skipDuplicates: true });
  _ready = Date.now();
}

// Strip anything that looks like an SSN, card number, PIN or one-time code before notes go to the AI.
export const scrub = (t) => String(t || "")
  .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[hidden]")
  .replace(/\b(?:\d[ -]?){12,18}\d\b/g, "[hidden]")
  .replace(/\b(pin|passcode|password|otp|code)\s*[:#=-]?\s*\S+/gi, "$1 [hidden]");

const hashOf = (t) => crypto.createHash("sha1").update(String(t || "").trim()).digest("hex");

// Notes go to the AI in small groups (3 agents at a time) so free AI plans never hit their size limits,
// then the answers are joined into one coaching post.
export async function coachPads(agents) {
  const pads = agents.filter((a) => (a.padText || "").trim()).map((a) => ({ agentUserId: a.id, agent: a.name, agentId: a.agentId, notes: scrub(a.padText).replace(/^=== (.+) ===$/gm, "[$1]").slice(-3500) }));
  if (!pads.length) return { agents: [], empty: true };
  if (pads.length > 3) {
    const parts = [];
    for (let i = 0; i < pads.length; i += 3) { try { parts.push(await coachGroup(pads.slice(i, i + 3))); } catch (e) { parts.push({ agents: [], overview: "" , err: e.message }); } }
    const agentsOut = parts.flatMap((p) => p.agents || []);
    if (!agentsOut.length) throw new Error(parts.find((p) => p.err)?.err || "The coach couldn't read the notes this time. Try again.");
    return { overview: parts.map((p) => p.overview).filter(Boolean).join(" ").slice(0, 600), agents: agentsOut };
  }
  return coachGroup(pads);
}
async function coachGroup(pads) {
  const r = await askAI(`You are Modo's notepad coach for a US call-center admin. Below are agents' personal notepads (rough notes about customers they are working).
For each agent, summarise their notes and, for every customer mentioned, coach the admin on the next conversation.
Rules:
- Use only what the notes say plus the company knowledge, training lessons and product knowledge you were given. Never invent prices, discounts, gifts or devices; if a price is involved say "confirm the current offer before quoting".
- Follow the call guide: say who we really are, never claim to be the customer's provider unless authorised, no pressure, respect "not interested"/do-not-call, never ask for passwords, PINs, one-time codes, full card numbers or SSNs.
- Write the "say" line as natural, friendly American English the agent can read out loud.
- Flag anything risky (a promise made, sensitive data written in the notes, an angry customer, an opt-out request).
Return JSON only:
{"overview":"2-3 short lines for the admin about these notes",
 "agents":[{"agentUserId":"…","agent":"…","summary":"1-2 lines","customers":[{"customer":"name or short description","situation":"what's going on (1 line)","mood":"e.g. interested / unsure / frustrated / not interested","say":"exact opening line to use","engage":"how to engage this person: tone, what to ask, which objection to expect and how to answer (2-3 short lines)","next":"next step and when","flags":["…"]}],"followups":["other to-dos from the notes"]}]}`,
    JSON.stringify(pads), { json: true, maxTokens: 2200, knowledge: false });
  if (!r || !Array.isArray(r.agents)) throw new Error("The coach couldn't read the notes this time. Try again.");
  return r;
}

async function post(id, data) {
  await db.message.update({ where: { id }, data: { text: JSON.stringify(data) } });
  await db.conversation.update({ where: { id: COACH }, data: { lastMessageAt: new Date() } });
  try {
    const admins = (await db.convMember.findMany({ where: { conversationId: COACH }, select: { userId: true } })).map((x) => x.userId);
    const who = data.agent ? data.agent + "'s notepad" : "all notepads";
    if (admins.length) sendPush(admins, { title: "🧠 Notepad coach", body: `New coaching for ${who}`, url: "/admin/chat", tag: "chat-" + COACH });
  } catch {}
}

// The automatic round: coach agents whose notepad changed since their last coaching (max `limit` per tick).
export async function tick({ limit = 2 } = {}) {
  if (Date.now() - _errAt < 5 * 60000) return { ok: false, skipped: "recent error" };
  await ensureCoach();
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true, NOT: { padText: null } }, select: { id: true, name: true, agentId: true, padText: true } });
  const withNotes = agents.filter((a) => (a.padText || "").trim());
  if (!withNotes.length) return { ok: true, coached: 0 };
  const recent = await db.message.findMany({ where: { conversationId: COACH, kind: "COACH" }, orderBy: { createdAt: "desc" }, take: 300, select: { text: true, createdAt: true } });
  const last = {};
  for (const m of recent) { let d = {}; try { d = JSON.parse(m.text); } catch {} if (d.agentUserId && !last[d.agentUserId]) last[d.agentUserId] = { hash: d.hash, at: m.createdAt }; }
  const due = withNotes.map((a) => ({ a, h: hashOf(a.padText), l: last[a.id] }))
    .filter(({ h, l }) => !l || (l.hash !== h && Date.now() - new Date(l.at) > GAP_MIN * 60000))
    .sort((x, y) => (x.l ? new Date(x.l.at) : 0) - (y.l ? new Date(y.l.at) : 0))
    .slice(0, limit);
  let coached = 0;
  for (const { a, h } of due) {
    // Claim this agent+version first (fixed id), so two Modo tabs ticking at once can't post it twice.
    const id = `coach-${a.id}-${h.slice(0, 16)}`;
    const claim = await db.message.createMany({ data: [{ id, conversationId: COACH, userId: "modo-bot", kind: "COACH", text: JSON.stringify({ agentUserId: a.id, agent: a.name, hash: h, pending: true }) }], skipDuplicates: true });
    if (!claim.count) continue;
    try {
      const result = await coachPads([a]);
      await post(id, { agentUserId: a.id, agent: a.name, hash: h, result });
      coached++;
    } catch (e) {
      _errAt = Date.now();
      await db.message.delete({ where: { id } }).catch(() => {}); // retried on a later tick
      // Tell the admins why (at most once an hour) instead of failing silently.
      await db.message.createMany({ data: [{ id: "coach-err-" + new Date().toISOString().slice(0, 13), conversationId: COACH, userId: "system", kind: "SYSTEM", text: "⚠️ The notepad coach couldn't run: " + String(e.message || "AI error").slice(0, 200) + " — it retries by itself. Check Connectors → AI provider if this keeps happening." }], skipDuplicates: true }).catch(() => {});
      return { ok: false, coached, error: e.message };
    }
  }
  return { ok: true, coached };
}

// "Coach everyone now" from the channel: one post covering every agent with notes.
export async function coachAllNow(byName) {
  await ensureCoach();
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true, padText: true } });
  const result = await coachPads(agents);
  const m = await db.message.create({ data: { conversationId: COACH, userId: "modo-bot", kind: "COACH", text: JSON.stringify({ all: true, by: byName, result }) } });
  await post(m.id, { all: true, by: byName, result });
  return m.id;
}
