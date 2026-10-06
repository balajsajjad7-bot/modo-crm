import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { askAI } from "@/lib/ai";
import { canTouch } from "@/lib/crm";
import { coachPads } from "@/lib/coach";

// One endpoint for the small "✨ AI" buttons all over Modo. The server loads the data itself, so the browser can't
// read anything the user couldn't already see. Private fields (SSN, date of birth, passwords) never go to the AI.
const T = {
  // Admin notepad coach (the same coach also posts by itself into Chat → #notepad-coach).
  async coach_notepads(s, b) {
    if (s.role !== "ADMIN" && s.role !== "SUPERVISOR") throw new Error("Only admins can use the notepad coach.");
    const agents = await db.user.findMany({ where: { role: "AGENT", ...(b.agentId ? { id: String(b.agentId) } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true, padText: true } });
    return coachPads(agents);
  },
  async brief_customer(s, b) {
    const c = await db.contact.findUnique({ where: { id: b.contactId || "" } });
    if (!c || !canTouch(s, c)) throw new Error("Customer not found.");
    const [acts, deals, tasks] = await Promise.all([
      db.crmActivity.findMany({ where: { contactId: c.id }, orderBy: { createdAt: "desc" }, take: 25 }),
      db.deal.findMany({ where: { contactId: c.id } }), db.task.findMany({ where: { contactId: c.id, done: false } }),
    ]);
    const data = { name: c.name, city: c.city, tags: c.tags, deals: deals.map((d) => ({ title: d.title, stage: d.stage, value: d.value })), openTasks: tasks.map((t) => ({ title: t.title, due: t.dueAt })),
      history: acts.map((a) => ({ when: a.createdAt, kind: a.kind, text: a.text })) };
    return { text: await askAI(`You prepare a call-center agent for a callback. From the customer record, write in plain short lines:
1) Who they are and what they want (1 line)
2) What happened last time (1-2 lines)
3) A natural opening sentence for the call
4) The next step to aim for
No preamble, no markdown headings.`, JSON.stringify(data), { maxTokens: 500 }) };
  },
  async tidy_note(s, b) {
    return { text: await askAI("Rewrite this call-center note so it is clear, short and professional. Keep every fact, number, date and name. Fix spelling and grammar. Return only the note.", String(b.text || "").slice(0, 3000), { maxTokens: 500 }) };
  },
  async email_draft(s, b) {
    const r = await askAI(`Write a short, warm, professional email from a US utility/telecom savings company to a customer. Plain text, no placeholders like [Name] unless unknown; sign off with the sender name given. Never promise discounts or terms that weren't given.
Return JSON: {"subject":"…","body":"…"}`, `Customer first name: ${b.customer || "(unknown)"}\nSender: ${b.sender || ""}\nWhat the email should say: ${String(b.prompt || "").slice(0, 1500)}\n${b.current ? "Current draft to improve:\n" + String(b.current).slice(0, 3000) : ""}`, { json: true, maxTokens: 800 });
    return r || {};
  },
  async summarize_chat(s, b) {
    const m = await db.convMember.findFirst({ where: { conversationId: b.conversationId || "", userId: s.uid } });
    if (!m && s.role !== "ADMIN") throw new Error("You're not in this conversation.");
    const msgs = await db.message.findMany({ where: { conversationId: b.conversationId, deletedAt: null, kind: "TEXT" }, orderBy: { createdAt: "desc" }, take: 120 });
    const u = await db.user.findMany({ where: { id: { in: [...new Set(msgs.map((x) => x.userId))] } }, select: { id: true, name: true } });
    const text = msgs.reverse().map((x) => `${u.find((y) => y.id === x.userId)?.name || "?"}: ${x.text}`).join("\n");
    if (!text) return { text: "Nothing to summarise yet." };
    return { text: await askAI("Summarise this team chat for someone who missed it: 3-6 short bullet lines of what was discussed and decided, then 'To do:' lines with who needs to do what (if any). Plain text.", text.slice(-12000), { maxTokens: 600 }) };
  },
  async explain_report(s, b) {
    return { text: await askAI("You are a call-center operations analyst. From these report numbers, write 4-6 short plain-language bullet lines: what's going well, what's worrying, and one concrete action for tomorrow. Mention names and numbers.", JSON.stringify(b.data || {}).slice(0, 12000), { maxTokens: 600 }) };
  },
  async agent_review(s, b) {
    if (s.role !== "ADMIN") throw new Error("Admins only.");
    const since = new Date(Date.now() - 30 * 86400000);
    const [u, sales, att, qa, be] = await Promise.all([
      db.user.findUnique({ where: { id: b.userId || "" }, select: { name: true, shiftStart: true, shiftHours: true, createdAt: true } }),
      db.sale.findMany({ where: { userId: b.userId, createdAt: { gte: since } }, select: { status: true, createdAt: true } }),
      db.attendance.findMany({ where: { userId: b.userId, clockIn: { gte: since } }, select: { shiftDate: true, lateSeconds: true, clockIn: true, clockOut: true } }),
      db.qaReview.findMany({ where: { userId: b.userId, createdAt: { gte: since } }, select: { overall: true, fillers: true, agentNervous: true, grammar: true } }),
      db.beSale.findMany({ where: { userId: b.userId, createdAt: { gte: since } }, select: { status: true } }),
    ]);
    if (!u) throw new Error("Agent not found.");
    const data = { name: u.name, daysWorked: att.length, lateDays: att.filter((a) => a.lateSeconds > 0).length, avgLateMin: att.length ? Math.round(att.reduce((t, a) => t + a.lateSeconds, 0) / att.length / 60) : 0,
      sales: { total: sales.length, active: sales.filter((x) => x.status === "VERIFIED").length, rejected: sales.filter((x) => x.status === "REJECTED").length },
      budgetEase: { total: be.length, approved: be.filter((x) => x.status === "APPROVED").length },
      quality: { calls: qa.length, avgScore: qa.length ? Math.round(qa.reduce((t, q) => t + q.overall, 0) / qa.length) : null, avgFillers: qa.length ? +(qa.reduce((t, q) => t + q.fillers, 0) / qa.length).toFixed(1) : null,
        avgNervous: qa.filter((q) => q.agentNervous != null).length ? Math.round(qa.reduce((t, q) => t + (q.agentNervous || 0), 0) / qa.filter((q) => q.agentNervous != null).length) : null,
        grammarExamples: qa.flatMap((q) => { try { return JSON.parse(q.grammar); } catch { return []; } }).slice(0, 5) } };
    return { text: await askAI("Write a fair, specific 30-day performance review of a call-center agent for their manager, from the data. Sections as short plain lines: Summary, Strengths, Needs work, Coaching plan (3 steps). Use the numbers. No markdown symbols.", JSON.stringify(data), { maxTokens: 900 }) };
  },
  async check_be(s, b) {
    if (s.role !== "ADMIN") throw new Error("Admins only.");
    const r = await db.beSale.findUnique({ where: { id: b.id || "" } });
    if (!r) throw new Error("Signup not found.");
    const data = { customer: r.customer, phone: r.phone, email: r.email, zip: r.zip, serviceAddress: r.serviceAddress, company: r.company, service: r.service, billAmount: r.billAmount, payAmount: r.payAmount, notes: r.notes, flags: r.flags };
    return { text: await askAI("You review a Budget Ease utility-bill discount signup (max discount 35%) before approval. In 3-6 short plain lines: does the data look consistent (ZIP vs address state, utility serves that area, realistic bill for the service, discount within policy, phone/email format)? What should admin verify on a quick callback? Don't invent facts; say when you're unsure.", JSON.stringify(data), { maxTokens: 500 }) };
  },
  async check_sale(s, b) {
    if (s.role !== "ADMIN") throw new Error("Admins only.");
    const r = await db.sale.findUnique({ where: { id: b.id || "" } });
    if (!r) throw new Error("Sale not found.");
    const { id, userId, closerId, raw, ...data } = r;
    return { text: await askAI("You review a telecom sale before it is marked active. In 3-6 short plain lines: anything inconsistent or missing (bill maths, discount, device details, dates, contact info), and what to verify with the customer. Don't invent facts.", JSON.stringify(data), { maxTokens: 500 }) };
  },
};

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json();
  const fn = T[b.task];
  if (!fn) return NextResponse.json({ error: "Unknown AI task." }, { status: 400 });
  try { return NextResponse.json(await fn(s, b)); }
  catch (e) { return NextResponse.json({ error: e.message || "AI failed." }, { status: 400 }); }
}
