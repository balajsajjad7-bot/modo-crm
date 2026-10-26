// Modo history: has Modo seen this customer before? Sales (admin only), customers and calls.
// Agents only get details of their own customers/calls, and a yes/no for everyone else's.
import { db } from "../db";
import { usTen } from "./http";

const last10 = (p) => usTen(p);
const sameNum = (a, d) => !!d && last10(a) === d;

export async function historyIntel({ phone, email }, s) {
  const d = last10(phone); const e = String(email || "").trim().toLowerCase() || null;
  if (!d && !e) return null;
  const admin = s.role === "ADMIN" || s.role === "SUPERVISOR"; // full customer + call view
  const salesOk = s.role === "ADMIN"; // sales stay admin-only
  const or = (fields) => [...(d ? fields.phone.map((f) => ({ [f]: { contains: d.slice(-4) } })) : []), ...(e ? fields.email.map((f) => ({ [f]: { equals: e, mode: "insensitive" } })) : [])];
  const [sales, contacts, calls] = await Promise.all([
    salesOk ? db.sale.findMany({ where: { OR: or({ phone: ["phone"], email: ["email"] }) }, orderBy: { createdAt: "desc" }, take: 80, select: { id: true, receipt: true, customer: true, phone: true, email: true, product: true, device: true, status: true, createdAt: true, duplicateOf: true, user: { select: { name: true } } } }) : [],
    db.contact.findMany({ where: { OR: or({ phone: ["phone"], email: ["email"] }) }, take: 40, select: { id: true, name: true, phone: true, email: true, ownerId: true, updatedAt: true } }),
    d ? db.callLog.findMany({ where: { phone: { contains: d.slice(-4) }, ...(admin ? {} : { userId: s.uid }) }, orderBy: { startedAt: "desc" }, take: 60, select: { id: true, phone: true, result: true, seconds: true, startedAt: true, user: { select: { name: true } } } }) : [],
  ]);
  const hit = (x) => sameNum(x.phone, d) || (e && String(x.email || "").toLowerCase() === e);
  const S = sales.filter(hit), C = contacts.filter(hit), L = calls.filter((c) => sameNum(c.phone, d));
  const mine = C.filter((c) => c.ownerId === s.uid);
  const others = C.length - mine.length;
  const facts = [], badges = [];
  if (salesOk) {
    facts.push(["Sales in Modo", S.length ? `${S.length} — ${S.filter((x) => x.status === "VERIFIED").length} active, ${S.filter((x) => x.status === "REJECTED").length} not active` : "None", S.length ? "warn" : null]);
    if (S.length) badges.push({ text: `Repeat customer · ${S.length} sale${S.length > 1 ? "s" : ""}`, tone: "warn" });
  }
  facts.push(["Customer records", C.length ? (admin ? `${C.length}` : `${mine.length} yours${others ? ` · ${others} with another agent` : ""}`) : "New to Modo"]);
  if (!admin && others) badges.push({ text: "Belongs to another agent", tone: "warn" });
  if (!C.length && !S.length) badges.push({ text: "New to Modo", tone: "ok" });
  facts.push(["Calls logged", L.length ? `${L.length}${L[0] ? ` · last ${new Date(L[0].startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${L[0].result ? " (" + L[0].result + ")" : ""}` : ""}` : "None"]);
  return {
    facts, badges,
    sales: salesOk ? S.slice(0, 12).map((x) => ({ id: x.id, receipt: x.receipt, customer: x.customer, product: x.product || x.device, status: x.status, at: x.createdAt, agent: x.user?.name, dup: !!x.duplicateOf })) : undefined,
    contacts: (admin ? C : mine).slice(0, 8).map((c) => ({ id: c.id, name: c.name, at: c.updatedAt })),
    calls: L.slice(0, 8).map((c) => ({ at: c.startedAt, result: c.result, seconds: c.seconds, agent: c.user?.name })),
    sources: [{ name: "Modo database", ok: true, ms: 0 }],
  };
}
