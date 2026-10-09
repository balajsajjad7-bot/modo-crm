// Every Modo bot gets its own chat (admins only), under "Bots" in Chat: everything it does lands there, and you can
// talk to it — status, run now, on/off, plus its own commands (the Workspace bot creates customers' Modos).
import crypto from "crypto";
import { headers } from "next/headers";
import { db, mainDb, currentOrg } from "./db";
import { BOT_INFO, botConfig, saveBotConfig } from "./botsPlus";

export const EXTRA_CHAT_BOTS = [
  { key: "workspaces", emoji: "🏢", name: "Workspace bot", desc: "Creates a separate Modo for every new customer (database + admin and agent logins), pauses, resumes and resets them.", event: true, mainOnly: true },
  { key: "complaints", emoji: "📣", name: "Complaints bot", desc: "Every customer complaint agents file, the moment it comes in.", event: true },
];
export const ROSTER = [...BOT_INFO, ...EXTRA_CHAT_BOTS];
export const convId = (key) => "botx-" + key;
const byKey = Object.fromEntries(ROSTER.map((b) => [b.key, b]));

// Which bot an alert belongs to, from its key (alerts sent outside a bot run: sign-ups, complaints, hiring…).
const PREFIX = [[/^(subreq|ws-|workspace)/, "workspaces"], [/^(complaint|cmp)/, "complaints"], [/^(hire-|iv-)/, "interviews"], [/^brief-/, "briefing"],
  [/^(cb-|callback|overdue)/, "callbacks"], [/^(sale-|dup-|fix-)/, "sales"], [/^(late-|noshow-|break-|idle-|allow-)/, "attendance"], [/^review-/, "review"], [/^(pkg-|package)/, "packages"]];
export function botForKey(key) { for (const [re, b] of PREFIX) if (re.test(String(key))) return b; return null; }

const ready = new Map(); // per company
export async function ensureBotChats() {
  const org = currentOrg();
  if (Date.now() - (ready.get(org) || 0) < 10 * 60000) return;
  const admins = (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })).map((u) => u.id);
  for (const b of ROSTER) {
    if (b.mainOnly && org) continue; // the Workspace bot only exists in your own Modo
    const id = convId(b.key);
    await db.conversation.upsert({ where: { id }, update: { name: `${b.emoji} ${b.name}`, topic: b.desc }, create: { id, name: `${b.emoji} ${b.name}`, isGroup: true, isChannel: false, topic: b.desc } });
    if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: id, userId: u })), skipDuplicates: true });
  }
  ready.set(org, Date.now());
}

export async function postToBot(key, text, msgKey = "") {
  const b = byKey[key]; if (!b) return;
  if (b.mainOnly && currentOrg()) return;
  await ensureBotChats();
  const id = ("bx-" + key + "-" + (msgKey || crypto.randomBytes(6).toString("hex"))).slice(0, 190);
  const r = await db.message.createMany({ data: [{ id, conversationId: convId(key), userId: "modo-bot", kind: "TEXT", text: String(text).slice(0, 3900) }], skipDuplicates: true });
  if (r.count) await db.conversation.update({ where: { id: convId(key) }, data: { lastMessageAt: new Date() } }).catch(() => {});
}

// One-time links for new logins: the passwords are never written into chat, only behind a link that works once.
export async function stashCreds(payload) {
  const id = crypto.randomBytes(12).toString("base64url");
  const { enc } = await import("./crypto");
  const data = Buffer.from(JSON.stringify({ v: enc(JSON.stringify(payload)), exp: Date.now() + 30 * 60000 }), "utf8");
  await mainDb.fileBlob.create({ data: { id: "creds-" + id, userId: "system", name: "creds", mime: "application/json", size: data.length, data } });
  return id;
}
export async function takeCreds(id) {
  if (!/^[\w-]{10,30}$/.test(String(id || ""))) return null;
  const b = await mainDb.fileBlob.findUnique({ where: { id: "creds-" + id } }).catch(() => null);
  if (!b) return null;
  await mainDb.fileBlob.delete({ where: { id: "creds-" + id } }).catch(() => {});
  try { const o = JSON.parse(Buffer.from(b.data).toString("utf8")); if (o.exp < Date.now()) return null; const { dec } = await import("./crypto"); return JSON.parse(dec(o.v)); } catch { return null; }
}
const credsLink = (id) => {
  let host = ""; try { const h = headers(); host = h.get("x-forwarded-host") || h.get("host") || ""; } catch {}
  return `${host ? (/^localhost|^127\./.test(host) ? "http://" : "https://") + host : ""}/admin/subscriptions?creds=${id}`;
};

const ago = (t) => { if (!t) return "never"; const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };

// Admin typed something in a bot's chat → the bot's reply.
export async function handleBotChat(key, text, session) {
  const b = byKey[key]; if (!b) return null;
  const t = String(text || "").trim(); const low = t.toLowerCase().replace(/[!?.]+$/, "");
  const cfg = await botConfig(); const isOff = (cfg.off || []).includes(key);
  const { BOTS, EVERY, runOne } = await import("./bots");
  const helpExtra = key === "workspaces" ? "\n• new Acme Calls starter 10 agents sara@acme.com 0300 1234567 — create a customer + their Modo\n• list — every customer workspace\n• pause acmecalls / resume acmecalls\n• reset acmecalls — new admin password"
    : key === "complaints" ? "\n• open — complaints not resolved yet" : key === "interviews" ? "\n• upcoming — interviews booked" : "";
  if (/^(help|commands|menu|\?)$/.test(low)) return `${b.emoji} ${b.name}\n${b.desc}\n\nCommands:\n• status — on/off, last run, how often\n${BOTS[key] ? "• run — run it now\n• on / off" : "• (always on — it works whenever something happens)"}${helpExtra}`;
  if (/^(status|info)$/.test(low)) {
    const run = cfg.runs?.[key];
    const how = b.event ? "Works whenever something happens (no schedule)." : EVERY[key] ? `Checks every ${EVERY[key] >= 60 ? EVERY[key] / 60 + " h" : EVERY[key] + " min"}.` : "Checks every minute during the day.";
    return `${b.emoji} ${b.name} is ${isOff && !b.event ? "🔴 OFF" : "🟢 ON"}\n${how}${run ? `\nLast run: ${ago(run.at)} — ${run.result}` : b.event ? "" : "\nHasn't run yet."}`;
  }
  if (b.event && /^(on|off|turn on|turn off|enable|disable|start|stop)$/.test(low)) return `${b.name} is always on — it posts here whenever something happens.`;
  if (/^(on|turn on|enable|start)$/.test(low) || /^(off|turn off|disable|stop|pause)$/.test(low)) {
    const off = new Set(cfg.off || []); const turnOn = /^(on|turn on|enable|start)$/.test(low);
    if (turnOn) off.delete(key); else off.add(key);
    await saveBotConfig({ ...cfg, off: [...off] });
    return turnOn ? `🟢 ${b.name} is ON.` : `🔴 ${b.name} is OFF. Type "on" to turn it back on.`;
  }
  if (/^(run|run now|go|check)$/.test(low)) {
    if (!BOTS[key]) return "This bot works on events — there's nothing to run by hand.";
    if (isOff) return `${b.name} is off. Type "on" first.`;
    const r = await runOne(key);
    return r === "ok" ? `✅ ${b.name} ran just now. Anything it found is posted above.` : `⚠️ ${b.name}: ${r}`;
  }

  if (key === "workspaces") {
    if (currentOrg()) return "Workspaces are managed from the main Modo.";
    const T = await import("./tenants");
    if (/^(list|all|workspaces)$/.test(low)) {
      const all = Object.entries(await T.listTenants()).filter(([, x]) => x.status !== "failed");
      if (!all.length) return "No customer workspaces yet. Try: new Acme Calls starter 10 agents sara@acme.com";
      return "🏢 Customer workspaces\n" + all.map(([o, x]) => `• ${o} — ${x.name} · ${x.plan} · ${x.status}${x.trialEnds && x.status === "trial" ? " until " + new Date(x.trialEnds).toDateString() : ""} · ${x.seats || "?"} logins`).join("\n");
    }
    let m;
    if ((m = low.match(/^(pause|resume|activate|reset)\s+([a-z0-9]{3,24})$/))) {
      const [, act, org] = m; const reg = await T.listTenants();
      if (!reg[org]) return `No workspace called "${org}". Type list to see them.`;
      const { getAll, upsertSub } = await import("./subs"); const sub = (await getAll()).subs.find((s) => s.workspace === org);
      if (act === "reset") {
        const r = await T.resetWorkspaceAdmin(org);
        const id = await stashCreds({ org, company: reg[org].name, loginPath: "/login?w=" + org, users: [{ role: "ADMIN", id: r.id, name: r.name, password: r.password }], reset: true });
        return `🔑 New admin password made for ${reg[org].name} (${org}). 2-step sign-in was turned off so they can set it up again.\n🔐 Open it here (works once, 30 min): ${credsLink(id)}`;
      }
      const status = act === "pause" ? "paused" : reg[org].trialEnds && new Date(reg[org].trialEnds) > new Date() && reg[org].status === "trial" ? "trial" : "active";
      await T.setTenantStatus(org, status, status === "active" ? { trialEnds: null } : {});
      if (sub) await upsertSub({ id: sub.id, status }, session.name || "Admin");
      return act === "pause" ? `⏸️ ${reg[org].name} (${org}) is paused — their logins stop now.` : `▶️ ${reg[org].name} (${org}) is ${status} — they can sign in again.`;
    }
    if ((m = t.match(/^(?:new|create|add|make)\s+(?:a\s+)?(?:workspace|customer|company)?\s*(?:for\s+)?(.+)$/i))) {
      let rest = m[1];
      const plan = (rest.match(/\b(free|starter|next|enterprise)\b/i) || [])[1]?.toLowerCase() || "starter";
      const agents = parseInt((rest.match(/(\d{1,3})\s*(?:agents?|users?|seats?|people)/i) || [])[1], 10) || (plan === "free" ? 2 : 10);
      const email = (rest.match(/[^\s@,]+@[^\s@,]+\.[^\s@,]+/) || [])[0] || "";
      const phone = ((rest.match(/(\+?\d[\d\s-]{8,}\d)/) || [])[1] || "").replace(/\s+/g, " ");
      const company = rest.replace(/\b(free|starter|next|enterprise)\b/ig, "").replace(/\d{1,3}\s*(agents?|users?|seats?|people)/ig, "").replace(email, "").replace(phone, "").replace(/\b(plan|with|and|for|trial|on)\b/ig, " ").replace(/[,;|]+/g, " ").replace(/\s+/g, " ").trim();
      if (company.length < 2) return 'Tell me the company name, e.g. "new Acme Calls starter 10 agents sara@acme.com"';
      if (!(await T.canProvision())) return "Instant workspaces aren't switched on yet. Open Subscriptions → Modo setup bot and paste your Neon API key (1 minute).";
      const { upsertSub } = await import("./subs");
      const sub = await upsertSub({ company, contact: "", email, phone, plan, seats: agents + 1, status: plan === "free" ? "active" : "trial", notes: "Created by the Workspace bot" }, session.name || "Admin");
      try {
        const ws = await T.provisionWorkspace({ company, email, phone, plan, seats: agents + 1, source: "admin" });
        await upsertSub({ id: sub.id, workspace: ws.org, seats: ws.users.length, ...(ws.trialEnds ? { renewsAt: ws.trialEnds } : {}) }, session.name || "Admin");
        const id = await stashCreds({ org: ws.org, company, loginPath: "/login?w=" + ws.org, users: ws.users });
        return `✅ ${company} has its own Modo now.\n🏢 Workspace: ${ws.org} · ${plan}${ws.trialEnds ? ` · free trial until ${new Date(ws.trialEnds).toDateString()}` : ""}\n👥 ${ws.users.length} logins (1 admin + ${ws.users.length - 1} agents)\n🔐 Open the logins here (works once, 30 min): ${credsLink(id)}\nSend them to the customer — I don't keep passwords.`;
      } catch (e) { return `⚠️ I saved ${company} in Subscriptions but couldn't create the workspace: ${e.message}`; }
    }
    return 'Try: new Acme Calls starter 10 agents sara@acme.com · list · pause acmecalls · resume acmecalls · reset acmecalls · help';
  }
  if (key === "complaints" && /^(open|list|all|show)$/.test(low)) {
    const { listComplaints } = await import("./complaints");
    const open = (await listComplaints()).filter((c) => c.status === "open" || c.status === "in progress").slice(0, 12);
    return open.length ? "📣 Open complaints\n" + open.map((c) => `• #${c.no} ${c.priority === "urgent" ? "🚨 " : ""}${c.customer || "Customer"} — ${c.category} · ${c.status} · by ${c.by?.name}`).join("\n") + "\nSales → Complaints to handle them." : "✅ No open complaints.";
  }
  if (key === "interviews" && /^(upcoming|today|list|interviews)$/.test(low)) {
    const { loadHiring } = await import("./hiring");
    const v = await loadHiring();
    const up = v.candidates.flatMap((c) => (c.interviews || []).filter((i) => i.status === "scheduled" && new Date(i.at) > Date.now() - 3600000).map((i) => ({ c, i }))).sort((a, x) => new Date(a.i.at) - new Date(x.i.at)).slice(0, 12);
    return up.length ? "🎥 Upcoming interviews\n" + up.map(({ c, i }) => `• ${new Date(i.at).toLocaleString("en-US", { timeZone: "Asia/Karachi", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} PKT — ${c.name}${c.result ? ` (${c.result.score}/80 ${c.result.cefr})` : ""}`).join("\n") : "No interviews booked.";
  }
  return `I didn't get that. Type help to see what ${b.name} can do.`;
}
