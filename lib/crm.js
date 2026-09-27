import { db } from "./db";
export const STAGES = [
  { id: "lead", label: "New lead" }, { id: "contacted", label: "Contacted" }, { id: "quoted", label: "Quote sent" },
  { id: "won", label: "Won" }, { id: "lost", label: "Lost" },
];
export const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || id;
// Agents only see their own records; admin sees everything (optionally filtered by owner).
export const scope = (s, field = "ownerId", owner) => (s.role === "ADMIN" ? (owner ? { [field]: owner } : {}) : { [field]: s.uid });
export const canTouch = (s, row, field = "ownerId") => s.role === "ADMIN" || row?.[field] === s.uid;
export async function log(userId, { contactId = null, dealId = null, kind, text }) {
  await db.crmActivity.create({ data: { userId, contactId, dealId, kind, text: String(text).slice(0, 2000) } });
}
export async function names(ids) {
  const u = await db.user.findMany({ where: { id: { in: [...new Set(ids.filter(Boolean))] } }, select: { id: true, name: true } });
  return Object.fromEntries(u.map((x) => [x.id, x.name]));
}
