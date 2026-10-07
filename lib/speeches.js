// Campaign speeches: the admin's pitch for every campaign (Budget Ease, Verizon, AT&T…).
// Modo AI is trained on them (call assist, coaching, agent AI, practice) and agents see their own campaign's
// speech in their scratchpad. Stored as one JSON blob, so no database change is needed.
import { db } from "./db";

const ID = "ai-speeches";
let cache = { at: 0, list: [] };

export async function getSpeeches() {
  if (Date.now() - cache.at < 30000) return cache.list;
  const b = await db.fileBlob.findUnique({ where: { id: ID } }).catch(() => null);
  let list = []; try { list = b ? JSON.parse(Buffer.from(b.data).toString("utf8")).list || [] : []; } catch {}
  cache = { at: Date.now(), list };
  return list;
}
export async function saveSpeeches(list) {
  const clean = (Array.isArray(list) ? list : []).slice(0, 60).map((s) => ({
    id: String(s.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 40),
    campaignId: String(s.campaignId || "").slice(0, 40), campaign: String(s.campaign || "").slice(0, 80),
    title: String(s.title || "Speech").slice(0, 120), text: String(s.text || "").slice(0, 20000),
    dos: String(s.dos || "").slice(0, 3000), donts: String(s.donts || "").slice(0, 3000),
    active: s.active !== false, updatedAt: s.updatedAt || new Date().toISOString(),
  })).filter((s) => s.text.trim() || s.title.trim());
  const data = Buffer.from(JSON.stringify({ list: clean }), "utf8");
  await db.fileBlob.upsert({ where: { id: ID }, update: { data, size: data.length }, create: { id: ID, userId: "system", name: ID, mime: "application/json", size: data.length, data } });
  cache = { at: 0, list: [] };
  return clean;
}
export async function speechesFor(campaignId) {
  return (await getSpeeches()).filter((s) => s.active && (!s.campaignId || s.campaignId === campaignId));
}

const fmt = (s) => `--- ${s.campaign || "All campaigns"} · ${s.title} ---\n${s.text}${s.dos ? "\nAlways: " + s.dos : ""}${s.donts ? "\nNever: " + s.donts : ""}`;

// For the AI: the speech(es) of the agent's campaign, or of any campaign the question names; otherwise an index.
export async function speechBlock(query = "", campaignId = "") {
  const all = (await getSpeeches()).filter((s) => s.active);
  if (!all.length) return "";
  const q = String(query || "").toLowerCase();
  const hit = all.filter((s) => (campaignId && s.campaignId === campaignId) || (s.campaign && q.includes(s.campaign.toLowerCase())) || (s.title && s.title.length > 3 && q.includes(s.title.toLowerCase())));
  const general = all.filter((s) => !s.campaignId);
  const use = hit.length ? [...hit, ...general.filter((g) => !hit.includes(g))] : all.length <= 2 ? all : general;
  const parts = [];
  if (use.length) parts.push("Campaign speeches written by the admin — coach agents to say it THIS way, in these words, and follow the always/never lines:\n" + use.map(fmt).join("\n\n").slice(0, 7000));
  const rest = all.filter((s) => !use.includes(s));
  if (rest.length) parts.push("Other campaign speeches on file (ask by campaign name): " + rest.map((s) => `${s.campaign || "All"} – ${s.title}`).join("; "));
  return parts.join("\n\n");
}
