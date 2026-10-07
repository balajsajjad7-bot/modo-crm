// Campaign speeches: the admin's pitch for every campaign (Budget Ease, Verizon, AT&T…).
// Modo AI is trained on them (call assist, coaching, agent AI, practice) and agents see their own campaign's
// speech in their scratchpad. Stored as one JSON blob, so no database change is needed.
import { db } from "./db";
import { SEED_SPEECHES } from "./speechSeeds";

const ID = "ai-speeches";
let cache = { at: 0, list: [] };

export async function getSpeeches() {
  if (Date.now() - cache.at < 30000) return cache.list;
  const b = await db.fileBlob.findUnique({ where: { id: ID } }).catch(() => null);
  let list = null; try { list = b ? JSON.parse(Buffer.from(b.data).toString("utf8")).list || [] : null; } catch {}
  if (!list) list = await seeds(); // nothing saved yet → Modo's own speeches (Verizon first)
  list = [...list].sort((x, y) => (y.priority ? 1 : 0) - (x.priority ? 1 : 0));
  cache = { at: Date.now(), list };
  return list;
}
async function seeds() {
  const camps = await db.campaign.findMany({ select: { id: true, name: true } }).catch(() => []);
  return SEED_SPEECHES.map(({ campaignMatch, ...s }) => { const c = camps.find((x) => campaignMatch.test(x.name)); return { ...s, campaignId: c?.id || "", campaign: c?.name || s.campaign, updatedAt: new Date().toISOString() }; });
}
export async function seedList() { return seeds(); }

export async function saveSpeeches(list) {
  const clean = (Array.isArray(list) ? list : []).slice(0, 60).map((s) => ({
    id: String(s.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 40),
    campaignId: String(s.campaignId || "").slice(0, 40), campaign: String(s.campaign || "").slice(0, 80),
    title: String(s.title || "Speech").slice(0, 120), text: String(s.text || "").slice(0, 20000),
    dos: String(s.dos || "").slice(0, 3000), donts: String(s.donts || "").slice(0, 3000),
    active: s.active !== false, priority: !!s.priority, builtIn: !!s.builtIn, updatedAt: s.updatedAt || new Date().toISOString(),
  })).filter((s) => s.text.trim() || s.title.trim());
  const data = Buffer.from(JSON.stringify({ list: clean }), "utf8");
  await db.fileBlob.upsert({ where: { id: ID }, update: { data, size: data.length }, create: { id: ID, userId: "system", name: ID, mime: "application/json", size: data.length, data } });
  cache = { at: 0, list: [] };
  return clean;
}
export async function speechesFor(campaignId) {
  // Top-priority speeches go to every agent, first; then their own campaign's and the general ones.
  return (await getSpeeches()).filter((s) => s.active && (s.priority || !s.campaignId || s.campaignId === campaignId));
}

const fmt = (s) => `--- ${s.priority ? "★ TOP PRIORITY · " : ""}${s.campaign || "All campaigns"} · ${s.title} ---\n${s.text}${s.dos ? "\nAlways: " + s.dos : ""}${s.donts ? "\nNever: " + s.donts : ""}`;

// For the AI: the speech(es) of the agent's campaign, or of any campaign the question names; otherwise an index.
export async function speechBlock(query = "", campaignId = "") {
  const all = (await getSpeeches()).filter((s) => s.active);
  if (!all.length) return "";
  const q = String(query || "").toLowerCase();
  const hit = all.filter((s) => (campaignId && s.campaignId === campaignId) || (s.campaign && q.includes(s.campaign.toLowerCase())) || (s.title && s.title.length > 3 && q.includes(s.title.toLowerCase())));
  const general = all.filter((s) => !s.campaignId);
  // Top-priority speeches: in full when the question is about calls/selling (keeps free-AI requests small otherwise).
  const callTalk = !!campaignId || /pitch|speech|script|objection|rebuttal|customer|call|close|sell|sale|offer|plan|price|say|verizon|practi[cs]e/i.test(q);
  const top = callTalk ? all.filter((s) => s.priority) : [];
  const base = hit.length ? [...hit, ...general.filter((g) => !hit.includes(g))] : all.length <= 2 ? all : general;
  const use = [...top, ...base.filter((s) => !top.includes(s))];
  const parts = [];
  if (use.length) parts.push("Campaign speeches written by the admin — coach agents to say it THIS way, in these words, and follow the always/never lines:\n" + use.map(fmt).join("\n\n").slice(0, 7000));
  const rest = all.filter((s) => !use.includes(s));
  if (rest.length) parts.push("Other campaign speeches on file (ask by campaign name): " + rest.map((s) => `${s.campaign || "All"} – ${s.title}`).join("; "));
  return parts.join("\n\n");
}

// Practice scores: best/last score per agent per speech, so the admin sees who has learned it.
const SCORES = "ai-speech-scores";
export async function getScores() {
  const b = await db.fileBlob.findUnique({ where: { id: SCORES } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : {}; } catch { return {}; }
}
export async function recordScore(speechId, user, score) {
  const all = await getScores(); const k = String(speechId); all[k] = all[k] || {};
  const cur = all[k][user.uid] || { best: 0, count: 0 };
  all[k][user.uid] = { name: user.name || "Agent", best: Math.max(cur.best, score), last: score, count: cur.count + 1, at: new Date().toISOString() };
  const data = Buffer.from(JSON.stringify(all), "utf8");
  await db.fileBlob.upsert({ where: { id: SCORES }, update: { data, size: data.length }, create: { id: SCORES, userId: "system", name: SCORES, mime: "application/json", size: data.length, data } });
}
