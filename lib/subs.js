// Modo subscriptions: the plans you sell (Free → Starter → Next → Enterprise), the customers who subscribe,
// and which plan each of your own agents is on. Admin controls everything; payments are recorded by the admin
// (no card is ever taken by Modo itself). Stored as one blob, so no database change is needed.
import { db } from "./db";

const ID = "modo-subs";
// Market check (2026): HubSpot Sales Starter ≈ $20/seat, Pipedrive $14–$99, Aircall $30–$50, Five9/Talkdesk call-center suites $100+.
export const DEFAULT_PLANS = [
  { id: "free", name: "Free", price: 0, period: "month", seats: "Up to 3 users", tagline: "Try Modo with a small team", features: ["Chat & channels", "Notepad & scratchpad", "Attendance & breaks", "Sales log (50 / month)", "Basic reports"] },
  { id: "starter", name: "Starter", price: 19, period: "user / month", seats: "Up to 25 users", tagline: "For growing call teams", features: ["Everything in Free", "Unlimited sales & customers", "Modo AI assistant", "Callbacks & reminders", "WhatsApp inbox", "Payroll & late deductions"] },
  { id: "next", name: "Next", price: 49, period: "user / month", seats: "Up to 200 users", tagline: "The full call-center floor", popular: true, features: ["Everything in Starter", "Dialer + live listen / whisper / barge", "AI live call assist & QA scoring", "16 automation bots", "Campaign speeches & training", "Remote control of agents"] },
  { id: "enterprise", name: "Enterprise", price: 99, period: "user / month", seats: "Unlimited users", tagline: "Security, scale and support", features: ["Everything in Next", "Dedicated relay & fixed IP", "Custom AI training", "SSO & advanced security", "Priority support & onboarding", "Custom integrations"] },
];
export const STATUSES = ["trial", "active", "paused", "cancelled", "pending"];

async function load() {
  const b = await db.fileBlob.findUnique({ where: { id: ID } }).catch(() => null);
  let v = null; try { v = b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : null; } catch {}
  return { plans: v?.plans?.length ? v.plans : DEFAULT_PLANS, subs: v?.subs || [], agentPlans: v?.agentPlans || {}, history: v?.history || [] };
}
async function save(v) {
  const data = Buffer.from(JSON.stringify(v), "utf8");
  await db.fileBlob.upsert({ where: { id: ID }, update: { data, size: data.length }, create: { id: ID, userId: "system", name: ID, mime: "application/json", size: data.length, data } });
}
const clean = (s, n = 120) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x.toISOString(); };

export async function getAll() { return load(); }
export async function publicPlans() { return (await load()).plans; }

export async function savePlans(plans) {
  const v = await load();
  v.plans = (plans || []).slice(0, 6).map((p, i) => ({ id: clean(p.id || DEFAULT_PLANS[i]?.id || nid(), 30), name: clean(p.name, 40), price: Math.max(0, Number(p.price) || 0), period: clean(p.period || "user / month", 30), seats: clean(p.seats, 60), tagline: clean(p.tagline, 80), popular: !!p.popular, features: (p.features || []).map((f) => clean(f, 90)).filter(Boolean).slice(0, 12) }));
  await save(v); return v.plans;
}

// Add / update / activate / cancel / change plan for a customer subscription.
export async function upsertSub(input, by) {
  const v = await load();
  const now = new Date().toISOString();
  let s = input.id ? v.subs.find((x) => x.id === input.id) : null;
  const before = s ? { plan: s.plan, status: s.status } : null;
  if (!s) { s = { id: nid(), createdAt: now, status: "active", plan: "starter", startedAt: now, renewsAt: addMonths(now, 1) }; v.subs.unshift(s); }
  for (const k of ["company", "contact", "email", "phone", "notes"]) if (k in input) s[k] = clean(input[k], k === "notes" ? 500 : 120);
  if ("seats" in input) s.seats = Math.max(1, Math.min(10000, parseInt(input.seats, 10) || 1));
  if ("plan" in input && v.plans.some((p) => p.id === input.plan)) s.plan = input.plan;
  if ("price" in input) s.price = input.price === "" || input.price == null ? null : Math.max(0, Number(input.price) || 0); // custom price per user (blank = plan price)
  if ("status" in input && STATUSES.includes(input.status)) {
    s.status = input.status;
    if (input.status === "active" && !s.renewsAt) s.renewsAt = addMonths(now, 1);
    if (input.status === "trial") s.renewsAt = new Date(Date.now() + 14 * 86400000).toISOString(); // 14-day trial
    if (input.status === "cancelled") s.cancelledAt = now;
  }
  if ("renewsAt" in input && input.renewsAt) { const d = new Date(input.renewsAt); if (!isNaN(d)) s.renewsAt = d.toISOString(); }
  s.updatedAt = now;
  v.history = [{ at: now, by, sub: s.id, company: s.company, change: before ? `${before.plan}/${before.status} → ${s.plan}/${s.status}` : `new ${s.plan}/${s.status}` }, ...v.history].slice(0, 300);
  await save(v); return s;
}
export async function deleteSub(id) { const v = await load(); v.subs = v.subs.filter((x) => x.id !== id); await save(v); }

// Someone asks for a plan from the public page → a "pending" subscription for the admin to approve.
export async function requestSub({ company, contact, email, phone, plan, seats, notes }) {
  const v = await load();
  if (v.subs.filter((s) => s.status === "pending").length > 500) throw new Error("Too many requests right now. Try again later.");
  const s = { id: nid(), createdAt: new Date().toISOString(), status: "pending", plan: v.plans.some((p) => p.id === plan) ? plan : "starter", company: clean(company), contact: clean(contact), email: clean(email), phone: clean(phone, 40), seats: Math.max(1, Math.min(10000, parseInt(seats, 10) || 1)), notes: clean(notes, 500), source: "website" };
  v.subs.unshift(s); await save(v); return s;
}

export async function setAgentPlan(uid, plan) { const v = await load(); if (plan) v.agentPlans[uid] = plan; else delete v.agentPlans[uid]; await save(v); }
export async function agentPlan(uid) { const v = await load(); const id = v.agentPlans[uid]; return id ? v.plans.find((p) => p.id === id) || null : null; }

export function mrr(v) {
  const price = (s) => (s.price != null ? s.price : v.plans.find((p) => p.id === s.plan)?.price || 0);
  return v.subs.filter((s) => s.status === "active").reduce((t, s) => t + price(s) * (s.seats || 1), 0);
}
