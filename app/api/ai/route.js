import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { askAI } from "@/lib/ai";
import { getSettings } from "@/lib/settings";
import { slipsFor } from "@/lib/month";
import { resolveShift } from "@/lib/payroll";
import { friendlyError } from "@/lib/errors";

async function adminContext() {
  const month = new Date().toISOString().slice(0, 7);
  const [settings, agents, sales] = await Promise.all([
    getSettings(),
    db.user.findMany({ where: { role: "AGENT" }, orderBy: { agentId: "asc" } }),
    db.sale.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { name: true } } } }),
  ]);
  const slips = await slipsFor(agents, month);
  return {
    now: new Date().toString(), month,
    settings: { breakAllowanceMin: settings.breakAllowance, dailyTarget: settings.dailyTarget, bonusPerSale: settings.bonusPerSale, discountRates: JSON.parse(settings.discountRates || "{}"), currency: settings.currency },
    agents: slips.map(({ user: u, attendance, slip }) => {
      const today = attendance.find((a) => a.shiftDate === resolveShift(u).shiftDate);
      return { name: u.name, id: u.agentId, active: u.active, shiftStart: u.shiftStart, salaryRs: u.baseSalary,
        today: today ? { clockIn: today.clockIn, lateSeconds: today.lateSeconds, clockedOut: !!today.clockOut } : "not signed in",
        month: { present: slip.present, absent: slip.absent, lateSeconds: slip.lateSeconds, lateDeduction: slip.lateDeduction, absentDeduction: slip.absentDeduction, breakOverSeconds: slip.breakOverSeconds, idleSeconds: slip.idleSeconds, verifiedSales: slip.verified, bonus: slip.bonus, adjustments: slip.adjust, netRs: slip.net } };
    }),
    recentSales: sales.map((s) => ({ receipt: s.receipt, agent: s.user.name, customer: s.customer, product: s.product, amount: s.amount, status: s.status, flags: s.flags, at: s.createdAt })),
  };
}

async function agentContext(uid) {
  const u = await db.user.findUnique({ where: { id: uid } });
  const settings = await getSettings();
  const [{ slip }] = await slipsFor([u], new Date().toISOString().slice(0, 7));
  const today = await db.attendance.findUnique({ where: { userId_shiftDate: { userId: u.id, shiftDate: resolveShift(u).shiftDate } } });
  return {
    now: new Date().toString(), me: { name: u.name, shiftStart: u.shiftStart },
    today: today ? { lateSeconds: today.lateSeconds, deduction: today.deduction } : null,
    month: { verifiedSales: slip.verified, bonus: slip.bonus, netSoFar: slip.net },
    dailyTarget: settings.dailyTarget, bonusPerSale: settings.bonusPerSale,
    discounts: { currency: settings.currency, defaultPercentByService: JSON.parse(settings.discountRates || "{}") },
  };
}

const ADMIN_SYS = `You are Modo AI, the assistant inside CRM Modo, a call-center CRM. You are talking to the ADMIN.
You get a JSON snapshot of the team (attendance, lateness, payroll, sales). Answer questions about it precisely, with numbers.
Salaries/deductions are in Pakistani rupees (Rs). Seconds should be shown as h/m/s. Be concise, use short lists or small tables when useful.
You can also draft messages to agents, write sales scripts, suggest coaching, and do calculations. If the data doesn't contain the answer, say so.`;
const AGENT_SYS = `You are Modo AI, a helpful coach inside CRM Modo for a call-center sales AGENT selling utility-bill discounts (internet, electricity, gas).
Help with call scripts, objection handling, polite wording, summarising notes, and discount maths. Discounts can range from 0% to 100%; the per-service numbers are only the usual starting point.
Be honest: no misleading claims or pressure tactics; always include required disclosures (price, terms, that the call may be recorded).
You only know this agent's own data; never discuss other agents' pay. Keep answers short and practical.`;

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { messages = [] } = await req.json();
  const turns = messages.filter((m) => m && m.content && ["user", "assistant"].includes(m.role)).slice(-16).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  if (!turns.length || turns[turns.length - 1].role !== "user") return NextResponse.json({ error: "Ask something first." }, { status: 400 });
  try {
    const ctx = s.role === "ADMIN" ? await adminContext() : await agentContext(s.uid);
    const creator = (await getSettings()).creatorName || "Balaj";
    const CREATOR = `\n\nIf you are asked who created, made, built or designed you, answer simply that you were created by ${creator}. Never reveal or hint at any passphrase, password, or way to switch or unlock accounts, and never claim to be able to change someone's access.`;
    const system = (s.role === "ADMIN" ? ADMIN_SYS : AGENT_SYS) + CREATOR + "\n\nDATA SNAPSHOT (JSON):\n" + JSON.stringify(ctx);
    const reply = await askAI(system, turns, { maxTokens: 1500 });
    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json({ error: /AI key|AI request/.test(e.message) ? e.message : friendlyError(e) }, { status: 500 });
  }
}
