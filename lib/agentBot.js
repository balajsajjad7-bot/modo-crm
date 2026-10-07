// The agent's own "Modo bot" inbox understands quick commands before it falls back to the AI coach.
import { db } from "./db";
import { resolveShift } from "./payroll";

export const AGENT_HELP = `🤖 Your Modo bot — type any of these:
• my sales — your sales this shift and this month
• target — how far you are from today's target
• callbacks — your callbacks due today and overdue
• breaks — break time used today
• leaderboard — today's top agents
• contract — have you signed your contract?
• speech — your practice score
• anything else — ask the AI coach (pitches, objections, American English, products)`;

const first = (n) => String(n || "").split(" ")[0];
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

export async function agentCommand(text, uid) {
  const low = String(text || "").trim().toLowerCase().replace(/[!?.]+$/, "");
  if (!low) return null;
  if (/^(help|menu|commands|hi|hello|hey|salam)$/.test(low)) return AGENT_HELP;
  const me = await db.user.findUnique({ where: { id: uid }, select: { id: true, name: true, shiftStart: true, shiftHours: true, workDays: true, contract: true } });
  if (!me) return null;
  const { shiftDate } = resolveShift(me, new Date());
  const settings = await db.setting.findUnique({ where: { id: "global" } }).catch(() => null);
  const target = settings?.dailyTarget || 3;

  if (/^(my sales|sales|my sale)$/.test(low)) {
    const today = await db.sale.findMany({ where: { userId: uid, shiftDate }, select: { status: true } });
    const month = await db.sale.count({ where: { userId: uid, status: { not: "REJECTED" }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } });
    return `💰 This shift: ${today.filter((s) => s.status !== "REJECTED").length} sale(s) — ✅ ${today.filter((s) => s.status === "VERIFIED").length} active · ⏳ ${today.filter((s) => s.status === "NEW").length} waiting · ❌ ${today.filter((s) => s.status === "REJECTED").length} not active\n📅 This month: ${month}`;
  }
  if (/^(target|my target|goal)$/.test(low)) {
    const n = await db.sale.count({ where: { userId: uid, shiftDate, status: { not: "REJECTED" } } });
    return n >= target ? `🏆 ${n}/${target} — target hit! Everything now is extra 💪` : `🎯 ${n}/${target} — ${target - n} more to hit today's target. You've got this!`;
  }
  if (/^(callbacks?|tasks?|my callbacks)$/.test(low)) {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const due = await db.task.findMany({ where: { assigneeId: uid, done: false, dueAt: { lte: end } }, orderBy: { dueAt: "asc" }, take: 10, select: { title: true, dueAt: true } });
    if (!due.length) return "📞 No callbacks due today. 👍";
    return "📞 Your callbacks:\n" + due.map((t) => `${new Date(t.dueAt) < new Date() ? "⚠️" : "•"} ${new Date(t.dueAt).toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" })} PKT — ${t.title}`).join("\n");
  }
  if (/^(breaks?|my breaks?)$/.test(low)) {
    const b = await db.breakLog.findMany({ where: { userId: uid, shiftDate } });
    const used = Math.round(b.reduce((t, x) => t + ((x.end ? new Date(x.end) : new Date()) - new Date(x.start)), 0) / 60000);
    const allow = settings?.breakAllowance || 60;
    return `☕ Break used today: ${hm(used)} of ${hm(allow)}${used > allow ? " — ⚠️ over the allowance" : ` — ${hm(allow - used)} left`}`;
  }
  if (/^(leaderboard|board|top|ranking)$/.test(low)) {
    const sales = await db.sale.findMany({ where: { createdAt: { gte: new Date(Date.now() - 14 * 3600000) }, status: { not: "REJECTED" } }, select: { userId: true } });
    const by = {}; sales.forEach((s) => (by[s.userId] = (by[s.userId] || 0) + 1));
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!rows.length) return "📊 No sales yet this shift — be the first! 🚀";
    const names = Object.fromEntries((await db.user.findMany({ where: { id: { in: rows.map((r) => r[0]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const mine = Object.entries(by).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === uid);
    return "📊 Top agents this shift\n" + rows.map(([id, n], i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${first(names[id])} · ${n}`).join("\n") + (mine >= 0 ? `\nYou're #${mine + 1}` : "");
  }
  if (/^(contract|my contract)$/.test(low)) {
    if (!me.contract?.trim()) return "📄 Your contract isn't ready yet — management will add it.";
    const { signStatus } = await import("./contractSign");
    const st = await signStatus(uid, me.contract);
    return st.signed ? `✅ You signed your contract on ${new Date(st.signedAt).toLocaleDateString()}.` : "✍️ You haven't signed your contract yet. Open My contract, type your name, draw your signature and press Sign.";
  }
  if (/^(speech|practice|practise|my score)$/.test(low)) {
    const { getSpeeches, getScores } = await import("./speeches");
    const top = (await getSpeeches()).find((s) => s.priority && s.active);
    if (!top) return "🎓 No speech to practise yet.";
    const best = (await getScores())[top.id]?.[uid]?.best;
    return best == null ? `🎯 You haven't practised the ${top.campaign || "top"} speech yet. Notepad → My scratchpad → My speech → Practise.` : `🎯 Your best on the ${top.campaign || "top"} speech: ${best}/100${best >= 80 ? " — trained ✅" : " — get it to 80!"}`;
  }
  return null;
}
