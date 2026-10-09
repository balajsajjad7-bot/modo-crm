// More Modo bots. Same rules as lib/bots.js: they run on the tick, every message has a fixed key so nothing is
// ever posted twice, admins get #modo-bot (+ phone/WhatsApp for important ones), agents get their own
// "Modo bot" inbox, and the whole team gets #wins for celebrations and the live leaderboard.
import { db } from "./db";
import { sendPush } from "./push";
import { resolveShift, shiftBounds } from "./payroll";

const first = (n) => String(n || "").split(" ")[0];
const mins = (ms) => Math.max(0, Math.round(ms / 60000));
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
const worksOn = (u, dow) => String(u.workDays || "").split(",").map(Number).includes(dow);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const weekKey = (d = new Date()) => { const t = new Date(d); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return dayKey(t); };

// #wins — everyone's in it: sale celebrations, target shout-outs, the hourly leaderboard.
export const WINS = "wins";
let _wins = 0;
async function ensureWins() {
  if (Date.now() - _wins < 10 * 60000) return;
  await db.conversation.upsert({ where: { id: WINS }, update: {}, create: { id: WINS, name: "wins", isGroup: true, isChannel: true, topic: "🎉 Sales, targets hit and the live leaderboard — posted by the Modo bots" } });
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  await db.convMember.createMany({ data: users.map((u) => ({ conversationId: WINS, userId: u.id })), skipDuplicates: true });
  _wins = Date.now();
}
async function postWins(key, text, push = false) {
  await ensureWins();
  const r = await db.message.createMany({ data: [{ id: ("wins-" + key).slice(0, 190), conversationId: WINS, userId: "modo-bot", kind: "TEXT", text: String(text).slice(0, 3900) }], skipDuplicates: true });
  if (!r.count) return false;
  await db.conversation.update({ where: { id: WINS }, data: { lastMessageAt: new Date() } });
  if (push) { const ids = (await db.user.findMany({ where: { active: true }, select: { id: true } })).map((u) => u.id); sendPush(ids, { title: "🎉 Modo wins", body: String(text).split("\n")[0].slice(0, 140), url: "/agent/chat", tag: "wins" }).catch(() => {}); }
  return true;
}

// ── 5. Celebrations: every activated sale, and every agent who hits today's target ──
async function winsBot({ now, agents, settings, alert, tellAgent }) {
  const target = settings?.dailyTarget || 3;
  const won = await db.sale.findMany({ where: { status: "VERIFIED", activatedAt: { gte: new Date(now - 3 * 3600000) } }, select: { id: true, userId: true, device: true, product: true, orderNumber: true, shiftDate: true }, take: 40 });
  for (const s of won) {
    const a = agents.find((x) => x.id === s.userId); if (!a) continue;
    await postWins("sale-" + s.id, `🎉 ${first(a.name)} just got a sale activated${s.device || s.product ? ` — ${s.device || s.product}` : ""}! Keep it going 🔥`);
    const n = await db.sale.count({ where: { userId: s.userId, shiftDate: s.shiftDate, status: { not: "REJECTED" } } });
    if (n >= target) {
      const fresh = await postWins(`target-${s.userId}-${s.shiftDate}`, `🏆 ${a.name} hit today's target of ${target}! 👏👏`, true);
      if (fresh) await tellAgent(`target-${s.userId}-${s.shiftDate}`, s.userId, `🏆 You hit today's target (${n}/${target}). Amazing work — every extra sale now is bonus territory 💪`);
    }
  }
}

// ── 6. Live leaderboard in #wins, every hour of the shift ──
async function leaderboardBot({ now, agents }) {
  if (!agents.length) return;
  const since = new Date(now - 14 * 3600000);
  const sales = await db.sale.findMany({ where: { createdAt: { gte: since }, status: { not: "REJECTED" } }, select: { userId: true } });
  if (!sales.length) return;
  const by = {}; sales.forEach((s) => (by[s.userId] = (by[s.userId] || 0) + 1));
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const medal = ["🥇", "🥈", "🥉", "4.", "5."];
  const hour = now.toISOString().slice(0, 13);
  await postWins("lb-" + hour, `📊 Leaderboard right now\n${rows.map(([id, n], i) => `${medal[i]} ${first(agents.find((a) => a.id === id)?.name) || "—"} · ${n}`).join("\n")}\nTotal: ${sales.length} sale${sales.length === 1 ? "" : "s"} this shift`);
}

// ── 7. Pace coach: halfway and three-quarters through each agent's shift ──
async function paceBot({ now, agents, settings, tellAgent }) {
  const target = settings?.dailyTarget || 3;
  for (const a of agents) {
    const { shiftDate, dow } = resolveShift(a, now); if (!worksOn(a, dow)) continue;
    const { start, end } = shiftBounds(a, shiftDate); if (now < start || now > end) continue;
    const at = await db.attendance.findUnique({ where: { userId_shiftDate: { userId: a.id, shiftDate } } }).catch(() => null); if (!at) continue;
    const pct = (now - start) / (end - start);
    const mark = pct >= 0.75 ? "75" : pct >= 0.5 ? "50" : null; if (!mark) continue;
    const n = await db.sale.count({ where: { userId: a.id, shiftDate, status: { not: "REJECTED" } } });
    const left = Math.max(0, target - n);
    const msg = left === 0 ? `🚀 ${mark}% of your shift done and you're already at ${n}/${target}. Push for a personal best!`
      : `⏱️ ${mark}% of your shift is done — you're at ${n}/${target}. ${left} to go in about ${hm(mins(end - now))}. Tip: call back your warmest customers first (Notepad → Callbacks).`;
    await tellAgent(`pace-${a.id}-${shiftDate}-${mark}`, a.id, msg, { push: left > 0 });
  }
}

// ── 8. Clock-out reminder: still clocked in 30 minutes after shift end ──
async function clockOutBot({ now, agents, alert, tellAgent }) {
  for (const a of agents) {
    const { shiftDate } = resolveShift(a, new Date(now - 6 * 3600000));
    const { end } = shiftBounds(a, shiftDate);
    if (now - end < 30 * 60000 || now - end > 6 * 3600000) continue;
    const at = await db.attendance.findUnique({ where: { userId_shiftDate: { userId: a.id, shiftDate } } }).catch(() => null);
    if (!at || at.clockOut) continue;
    await tellAgent(`clockout-${a.id}-${shiftDate}`, a.id, `🌙 Your shift ended ${hm(mins(now - end))} ago and you're still clocked in. Clock out if you're done for the day.`);
    await alert(`clockout-${a.id}-${shiftDate}`, `🌙 ${a.name} is still clocked in ${hm(mins(now - end))} after shift end`, { wa: false, push: false });
  }
}

// ── 9. Sales waiting for review (batched, at most once an hour) ──
async function reviewBot({ now, alert }) {
  const waiting = await db.sale.findMany({ where: { status: "NEW", createdAt: { lt: new Date(now - 2 * 3600000), gte: new Date(now - 7 * 24 * 3600000) } }, select: { orderNumber: true, receipt: true, customer: true }, take: 30 });
  if (!waiting.length) return;
  await alert(`review-${now.toISOString().slice(0, 13)}`, `🧾 ${waiting.length} sale${waiting.length === 1 ? " is" : "s are"} waiting more than 2 hours for review:\n${waiting.slice(0, 8).map((s) => `• #${s.orderNumber || s.receipt}${s.customer ? " · " + s.customer : ""}`).join("\n")}${waiting.length > 8 ? `\n…and ${waiting.length - 8} more` : ""}\nOpen Sales to mark them Active or Not active.`, { wa: false });
}

// ── 10. Packages stuck: label made 3+ days ago and never scanned, or a delivery problem ──
async function packageBot({ now, alert, tellAgent }) {
  const stuck = await db.sale.findMany({ where: { OR: [{ upsStatus: "label", createdAt: { lt: new Date(now - 3 * 24 * 3600000), gte: new Date(now - 30 * 24 * 3600000) } }, { upsStatus: "exception" }] }, select: { id: true, userId: true, orderNumber: true, receipt: true, customer: true, upsStatus: true, upsStage: true }, take: 30 });
  for (const s of stuck) {
    const tag = `#${s.orderNumber || s.receipt}${s.customer ? " · " + s.customer : ""}`;
    const why = s.upsStatus === "exception" ? `UPS reports a problem${s.upsStage ? ": " + s.upsStage : ""}` : "the label was made 3+ days ago but UPS hasn't scanned the package";
    await alert(`pkg-${s.id}-${s.upsStatus}`, `📦 Package needs attention ${tag}: ${why}`, { wa: s.upsStatus === "exception" });
    await tellAgent(`pkg-${s.id}-${s.upsStatus}`, s.userId, `📦 Your customer ${tag}: ${why}. Call them to check they dropped it off / fix the address.`);
  }
}

// ── 11. Contracts not signed: daily reminder to the agent + a list for admin ──
async function contractBot({ now, agents, alert, tellAgent }) {
  const { signStatus } = await import("./contractSign");
  const users = await db.user.findMany({ where: { role: "AGENT", active: true, NOT: { contract: null } }, select: { id: true, name: true, contract: true } });
  const unsigned = [];
  for (const u of users) { if (!u.contract?.trim()) continue; const st = await signStatus(u.id, u.contract); if (!st.signed) { unsigned.push(u); await tellAgent(`contract-${u.id}-${dayKey(now)}`, u.id, "✍️ Please sign your contract: open My contract, type your name, draw your signature and press Sign."); } }
  if (unsigned.length) await alert(`contracts-${dayKey(now)}`, `✍️ Contracts not signed yet: ${unsigned.map((u) => first(u.name)).join(", ")}`, { wa: false, push: false });
}

// ── 12. Speech practice: agents below 80 on the top-priority speech get a daily nudge; admin gets the summary ──
async function trainingBot({ now, agents, alert, tellAgent }) {
  const { getSpeeches, getScores } = await import("./speeches");
  const top = (await getSpeeches()).find((s) => s.priority && s.active); if (!top) return;
  const sc = (await getScores())[top.id] || {};
  const behind = agents.filter((a) => !(sc[a.id]?.best >= 80));
  for (const a of behind) await tellAgent(`speech-${a.id}-${dayKey(now)}`, a.id, `🎯 Practise the ${top.campaign || "top"} speech today — ${sc[a.id] ? `your best is ${sc[a.id].best}/100` : "you haven't tried it yet"}. Notepad → My scratchpad → My speech → Practise. Get to 80+!`, { push: false });
  if (agents.length) await alert(`speech-${dayKey(now)}`, `🎓 ${top.campaign || "Top"} speech: ${agents.length - behind.length}/${agents.length} agents trained (80+).${behind.length ? " Still learning: " + behind.slice(0, 12).map((a) => first(a.name)).join(", ") : " Everyone's trained 🎉"}`, { wa: false, push: false });
}

// ── 13. Customers going cold: weekly list per agent of customers with no contact for 7+ days ──
async function followUpBot({ now, agents, tellAgent }) {
  const since = new Date(now - 7 * 24 * 3600000);
  for (const a of agents) {
    const mine = await db.contact.findMany({ where: { ownerId: a.id, createdAt: { lt: since } }, select: { id: true, name: true, phone: true }, take: 200 });
    if (!mine.length) continue;
    const ids = mine.map((c) => c.id);
    const recent = new Set((await db.crmActivity.findMany({ where: { contactId: { in: ids }, createdAt: { gte: since } }, select: { contactId: true } })).map((x) => x.contactId));
    const open = new Set((await db.task.findMany({ where: { contactId: { in: ids }, done: false }, select: { contactId: true } })).map((x) => x.contactId));
    const cold = mine.filter((c) => !recent.has(c.id) && !open.has(c.id)).slice(0, 6);
    if (!cold.length) continue;
    await tellAgent(`cold-${a.id}-${weekKey(now)}`, a.id, `🧊 Customers you haven't talked to in a week:\n${cold.map((c) => `• ${c.name}${c.phone ? " · " + c.phone : ""}`).join("\n")}\nA quick check-in call can turn into a sale — or set a callback in Notepad.`, { push: false });
  }
}

// ── 14. Call quality: a low-scored call gets the agent one clear tip, and admin a heads-up ──
async function qualityBot({ now, agents, alert, tellAgent }) {
  const low = await db.callSession.findMany({ where: { score: { lt: 60 }, endedAt: { gte: new Date(now - 24 * 3600000) } }, select: { id: true, userId: true, score: true, review: true }, take: 20 });
  for (const c of low) {
    let tip = ""; try { const r = JSON.parse(c.review || "{}"); tip = r.improve?.[0] || r.fix?.[0] || r.tips?.[0] || r.summary || ""; } catch { tip = ""; }
    const a = agents.find((x) => x.id === c.userId);
    await tellAgent(`qa-${c.id}`, c.userId, `🎧 One of your calls scored ${c.score}/100.${tip ? " Focus on this next time: " + String(tip).slice(0, 300) : ""} Open Quality to listen back.`, { push: false });
    await alert(`qa-${c.id}`, `🎧 Low-scored call: ${a ? a.name : "agent"} · ${c.score}/100`, { wa: false, push: false });
  }
}

// ── 15. Customer waiting on WhatsApp: Modo's suggested reply hasn't been OK'd for 10+ minutes ──
async function waWaitBot({ now, alert }) {
  const { listDrafts } = await import("./waReply");
  const drafts = (await listDrafts()).filter((d) => now - d.at > 10 * 60000);
  for (const d of drafts) await alert(`wawait-${d.conv}-${d.code}`, `💬 A WhatsApp customer has been waiting ${hm(mins(now - d.at))} for a reply (#${d.code}). Reply YES ${d.code}, NO ${d.code} or say ${d.code} <your words>.`, { push: true });
}

// ── 16. New agent welcome: their first steps in Modo ──
async function welcomeBot({ now, agents, tellAgent }) {
  const fresh = await db.user.findMany({ where: { role: "AGENT", active: true, createdAt: { gte: new Date(now - 3 * 24 * 3600000) } }, select: { id: true, name: true } });
  for (const u of fresh) await tellAgent(`welcome-${u.id}`, u.id, `👋 Welcome to Modo, ${first(u.name)}! Your first steps:\n1. My contract — read and sign it\n2. Notepad → My scratchpad → My speech — learn and practise the speech\n3. Submit sale — after every sale\n4. Chat → #wins — see the team's wins\nType "help" here any time to see what I can do for you.`);
}

// ── 17. Interview reminders: 15 minutes before every Zoom interview ──
async function interviewBot({ now, alert }) {
  const { loadHiring } = await import("./hiring");
  const v = await loadHiring();
  for (const c of v.candidates) for (const iv of c.interviews || []) {
    const mins = (new Date(iv.at) - now) / 60000;
    if (iv.status === "scheduled" && mins > 0 && mins <= 20) await alert(`iv-${iv.id}-${iv.at}`, `🎥 Interview in ${Math.round(mins)} min: ${c.name}${c.result ? ` (English ${c.result.score}/80 · ${c.result.cefr})` : ""}${iv.interviewer ? " with " + iv.interviewer : ""}
Start Zoom: ${iv.zoom?.startUrl || iv.zoom?.joinUrl || v.settings.zoomLink || "(add a Zoom link in Hiring)"}`, { wa: false });
  }
}

export const BOT_INFO = [
  { key: "briefing", emoji: "☀️", name: "Shift briefings", desc: "Start-of-shift briefing and end-of-shift report in #modo-bot (and WhatsApp)." },
  { key: "callbacks", emoji: "📞", name: "Callback reminders", desc: "Reminds agents 10 minutes before each callback; flags overdue ones to you." },
  { key: "sales", emoji: "🧾", name: "Sale checker", desc: "Checks every new sale for missing info, duplicates and card/SSN numbers." },
  { key: "attendance", emoji: "⏰", name: "Attendance & breaks", desc: "No-shows, late arrivals, long breaks, break allowance and idle agents." },
  { key: "wins", emoji: "🎉", name: "Celebrations", desc: "Posts every activated sale and every target hit in #wins for the whole team." },
  { key: "leaderboard", emoji: "📊", name: "Live leaderboard", desc: "Hourly top 5 in #wins during the shift." },
  { key: "pace", emoji: "⏱️", name: "Pace coach", desc: "Tells each agent at 50% and 75% of their shift how far they are from target." },
  { key: "clockout", emoji: "🌙", name: "Clock-out reminder", desc: "Agents still clocked in 30 min after their shift ends." },
  { key: "review", emoji: "🧾", name: "Review reminder", desc: "Sales waiting more than 2 hours for you to mark Active / Not active." },
  { key: "packages", emoji: "📦", name: "Stuck packages", desc: "Labels never scanned after 3 days, and UPS delivery problems — to you and the agent." },
  { key: "contracts", emoji: "✍️", name: "Contract signatures", desc: "Daily reminder to agents who haven't signed; list for you." },
  { key: "training", emoji: "🎓", name: "Speech trainer", desc: "Daily practise nudge for agents under 80 on the top speech; training summary for you." },
  { key: "followup", emoji: "🧊", name: "Cold customers", desc: "Weekly list per agent of customers nobody has talked to in 7+ days." },
  { key: "quality", emoji: "🎧", name: "Call quality", desc: "Low-scored calls: one clear tip to the agent, a heads-up to you." },
  { key: "wawait", emoji: "💬", name: "WhatsApp waiting", desc: "A customer's suggested reply has waited 10+ minutes for your OK." },
  { key: "welcome", emoji: "👋", name: "New agent welcome", desc: "First-steps message for every new agent." },
  { key: "interviews", emoji: "🎥", name: "Interview reminders", desc: "Pings you 15 minutes before every Zoom interview with the candidate's English score." },
];
export const EXTRA_BOTS = { wins: winsBot, leaderboard: leaderboardBot, pace: paceBot, clockout: clockOutBot, review: reviewBot, packages: packageBot, contracts: contractBot, training: trainingBot, followup: followUpBot, quality: qualityBot, wawait: waWaitBot, welcome: welcomeBot, interviews: interviewBot };

// On/off switches (admin → AI → Bots). Stored as one small blob.
export async function botConfig() {
  const b = await db.fileBlob.findUnique({ where: { id: "bots-config" } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : { off: [] }; } catch { return { off: [] }; }
}
export async function saveBotConfig(cfg) {
  const data = Buffer.from(JSON.stringify({ off: [...new Set((cfg.off || []).map(String))].slice(0, 50), runs: cfg.runs || {} }), "utf8");
  await db.fileBlob.upsert({ where: { id: "bots-config" }, update: { data, size: data.length }, create: { id: "bots-config", userId: "system", name: "bots-config", mime: "application/json", size: data.length, data } });
}
export { ensureWins };
