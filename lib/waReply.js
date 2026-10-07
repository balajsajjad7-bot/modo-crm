// Customer WhatsApp replies: Modo never sends a customer something the admin hasn't allowed.
//  • Mode "ask" (default): Modo AI writes a suggested reply and asks the admin first (WhatsApp + Modo).
//    The admin answers YES, NO, or "say …" with their own words.
//  • Mode "auto": Modo AI replies by itself, but only inside the admin's rules.
//  • Mode "off": only the team replies.
// Rules ("always say" / "never say") are kept in the WhatsApp settings and given to the AI every time.
// Links are removed from AI replies unless the admin allows them (no Verizon/AT&T/tracking links to customers).
import { db } from "./db";
import { getSettings, saveSettings } from "./walink";

const DRAFTS = "walink-drafts";
const clean = (s, n = 4000) => String(s ?? "").trim().slice(0, n);

export const DEFAULT_DONT = [
  "Never send links of any kind (no Verizon, AT&T, T-Mobile, carrier, UPS or tracking links).",
  "Never tell the customer to go to a carrier website, store or app, or to call the carrier.",
  "Never quote prices, discounts, free phones or gifts unless the admin wrote them in the rules.",
  "Never say we are Verizon, AT&T, T-Mobile or any provider.",
  "Never ask for passwords, PINs, one-time codes, card numbers or SSNs.",
].join("\n");

export async function replySettings() {
  const s = await getSettings();
  const mode = ["ask", "auto", "off"].includes(s.mode) ? s.mode : s.aiReply === "off" ? "off" : "ask";
  return { mode, say: s.say ?? "", dont: s.dont ?? DEFAULT_DONT, allowLinks: !!s.allowLinks, admins: s.admins || "" };
}

// Remove links and web addresses from anything the AI wants to send a customer.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|us|io|co|app|me|info|biz|ly|gl)(?:\/\S*)?/gi;
export function stripLinks(text) {
  // Drop every sentence that carries a link (a half-sentence like "track it at ." is worse than nothing).
  const keep = (part) => { URL_RE.lastIndex = 0; const bad = URL_RE.test(part); URL_RE.lastIndex = 0; return !bad; };
  return String(text || "").split("\n").map((line) => line.split(/(?<=[.!?])\s+/).filter(keep).join(" ")).join("\n")
    .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
export const hasLink = (t) => { URL_RE.lastIndex = 0; const r = URL_RE.test(String(t || "")); URL_RE.lastIndex = 0; return r; };

export function rulesPrompt(r) {
  return `
=== ADMIN'S RULES FOR CUSTOMER MESSAGES (always follow, they override everything else) ===
${r.say ? "ALWAYS / what to say:\n" + r.say + "\n" : ""}NEVER:
${r.dont || DEFAULT_DONT}
${r.allowLinks ? "" : "Do not include any link or web address at all.\n"}If the rules don't cover the question, say a team member will reply shortly — don't guess.`;
}

// ── Drafts waiting for the admin ──
async function load() {
  const b = await db.fileBlob.findUnique({ where: { id: DRAFTS } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : { n: 0, items: [] }; } catch { return { n: 0, items: [] }; }
}
async function save(box) {
  box.items = box.items.filter((d) => Date.now() - d.at < 24 * 3600000).slice(-40);
  const data = Buffer.from(JSON.stringify(box), "utf8");
  await db.fileBlob.upsert({ where: { id: DRAFTS }, update: { data, size: data.length }, create: { id: DRAFTS, userId: "system", name: DRAFTS, mime: "application/json", size: data.length, data } });
}
export async function listDrafts() { return (await load()).items.filter((d) => Date.now() - d.at < 24 * 3600000); }
export async function addDraft({ conv, to, name, question, draft }) {
  const box = await load();
  box.items = box.items.filter((d) => d.conv !== conv); // one waiting reply per customer (the newest)
  const code = (box.n % 99) + 1; box.n = code;
  const d = { code, conv, to, name: clean(name, 60), question: clean(question, 600), draft: clean(draft, 2000), at: Date.now() };
  box.items.push(d); await save(box);
  return d;
}
export async function dropDraft(match) {
  const box = await load(); const before = box.items.length;
  box.items = box.items.filter((d) => !match(d)); if (box.items.length !== before) await save(box);
}
export const latestDraftAt = async () => Math.max(0, ...(await listDrafts()).map((d) => d.at));

// Send a message into a customer conversation (stored in Modo + sent on WhatsApp).
export async function sendToCustomer(conv, text, byUserId = "modo-bot") {
  const { sendWA } = await import("./whatsapp");
  const to = conv.startsWith("wa-g-") ? conv.slice(5) + "@g.us" : conv.slice(3);
  const m = await db.message.create({ data: { conversationId: conv, userId: byUserId, kind: "TEXT", text: clean(text) } });
  await db.conversation.update({ where: { id: conv }, data: { lastMessageAt: m.createdAt } }).catch(() => {});
  const r = await sendWA(to, text).catch((e) => ({ ok: false, error: e.message }));
  if (!r.ok) await db.message.create({ data: { conversationId: conv, userId: "system", kind: "SYSTEM", text: `⚠️ Not delivered on WhatsApp: ${r.error}` } });
  return r;
}

const who = (d) => `${d.name || "Customer"}${/^\d+$/.test(d.to) ? " (+" + d.to + ")" : ""}`;

// Admin commands about customer replies — from WhatsApp or #modo-bot. Returns a reply, or null if not ours.
// YES [n] · NO [n] · say [n] <words> · drafts · rules · rule say: … · rule never: … · links on/off · mode ask|auto|off
export async function draftCommand(text, user = {}) {
  const t = String(text || "").trim(); const low = t.toLowerCase().replace(/[!.]+$/, "");
  const drafts = await listDrafts();
  const pick = (n) => (n ? drafts.find((d) => d.code === Number(n)) : drafts[drafts.length - 1]);

  let m;
  if (/^(drafts|waiting|pending|customers waiting)$/.test(low)) {
    if (!drafts.length) return "✅ No customer is waiting for a reply.";
    return "💬 Customers waiting for your OK:\n" + drafts.map((d) => `#${d.code} ${who(d)}: “${d.question.slice(0, 80)}”\n   💡 ${d.draft.slice(0, 160)}`).join("\n") + "\n\nReply YES 12 / NO 12 / say 12 your words.";
  }
  if ((m = low.match(/^(?:yes|y|send|ok|okay|haan|han|ji|send it)\s*#?(\d{1,2})?$/))) {
    if (!drafts.length) return null;
    // Plain YES belongs to Modo Agent if its question is newer than the newest customer draft.
    if (!m[1]) { const { pendingAt } = await import("./modoAgent"); if ((await pendingAt(user.uid)) > drafts[drafts.length - 1].at) return null; }
    const d = pick(m[1]); if (!d) return `❓ No waiting reply #${m[1]}. Type drafts to see them.`;
    await dropDraft((x) => x.code === d.code);
    const r = await sendToCustomer(d.conv, d.draft, user.uid || "modo-bot");
    return r.ok ? `✅ Sent to ${who(d)}${r.queued ? " (queued — goes out when the relay wakes)" : ""}:\n“${d.draft}”` : `⚠️ Couldn't send to ${who(d)}: ${r.error}`;
  }
  if ((m = low.match(/^(?:no|n|skip|cancel|nahi)\s*#?(\d{1,2})?$/))) {
    if (!drafts.length) return null;
    if (!m[1]) { const { pendingAt } = await import("./modoAgent"); if ((await pendingAt(user.uid)) > drafts[drafts.length - 1].at) return null; }
    const d = pick(m[1]); if (!d) return `❓ No waiting reply #${m[1]}.`;
    await dropDraft((x) => x.code === d.code);
    return `👍 Not sent. ${who(d)} is still in Modo → WhatsApp inbox if you want to answer later.`;
  }
  if ((m = t.match(/^(?:say|reply|tell (?:him|her|them)|send)\s*#?(\d{1,2})?\s*[:\-]?\s+([\s\S]+)$/i))) {
    if (!drafts.length) return null;
    const d = pick(m[1]); if (!d) return `❓ No waiting reply #${m[1]}. Type drafts to see them.`;
    await dropDraft((x) => x.code === d.code);
    const r = await sendToCustomer(d.conv, m[2].trim(), user.uid || "modo-bot");
    return r.ok ? `✅ Sent your words to ${who(d)}.` : `⚠️ Couldn't send: ${r.error}`;
  }
  if (/^(rules|my rules|what to say)$/.test(low)) {
    const r = await replySettings();
    return `📋 Customer reply rules (mode: ${r.mode === "ask" ? "ask me first" : r.mode === "auto" ? "AI replies by itself" : "off"} · links ${r.allowLinks ? "allowed" : "blocked"})\n\n✅ SAY:\n${r.say || "(nothing yet — add with: rule say: …)"}\n\n⛔ NEVER:\n${r.dont}\n\nAdd: rule say: … · rule never: … · rule clear say / rule clear never`;
  }
  if ((m = t.match(/^rule\s+(say|always|never|dont|don't)\s*:\s*([\s\S]+)$/i))) {
    const r = await replySettings(); const key = /^(say|always)$/i.test(m[1]) ? "say" : "dont";
    const line = m[2].trim().replace(/^[-•]\s*/, "");
    await saveSettings({ [key]: (r[key] ? r[key] + "\n" : "") + "- " + line });
    return `✅ Saved. Modo will ${key === "say" ? "say" : "never say"}: ${line}`;
  }
  if ((m = low.match(/^rule\s+clear\s+(say|never)$/))) { await saveSettings({ [m[1] === "say" ? "say" : "dont"]: m[1] === "say" ? "" : DEFAULT_DONT }); return m[1] === "say" ? "🧹 Cleared the SAY rules." : "🧹 NEVER rules reset to the safe defaults."; }
  if ((m = low.match(/^links\s+(on|off)$/))) { await saveSettings({ allowLinks: m[1] === "on" }); return m[1] === "on" ? "⚠️ Links allowed in AI replies." : "✅ Links blocked — Modo AI never sends links to customers."; }
  if ((m = low.match(/^(?:mode|reply mode)\s+(ask|auto|off)$/))) { await saveSettings({ mode: m[1], aiReply: m[1] === "off" ? "off" : "on" }); return { ask: "✅ Modo asks you before every customer reply.", auto: "⚠️ Modo AI now replies to customers by itself (inside your rules).", off: "✅ AI replies are off — only the team replies." }[m[1]]; }
  return null;
}
