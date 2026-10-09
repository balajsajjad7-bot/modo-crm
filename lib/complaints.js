// Customer complaints: an agent listens to the customer, types (or speaks) what's wrong, and admin gets it
// straight away. Admin works it (in progress → resolved) and every reply goes back to the agent's Modo bot.
import { db } from "./db";

const ID = "modo-complaints";
export const CATEGORIES = ["Billing / charges", "Service not working", "Delivery / order", "Cancellation request", "Agent behaviour", "Refund", "Technical issue", "Other"];
export const PRIORITIES = ["low", "normal", "high", "urgent"];
export const STATUSES = ["open", "in progress", "resolved", "closed"];

async function load() {
  const b = await db.fileBlob.findUnique({ where: { id: ID } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : []; } catch { return []; }
}
async function save(list) {
  const data = Buffer.from(JSON.stringify(list.slice(0, 3000)), "utf8");
  await db.fileBlob.upsert({ where: { id: ID }, update: { data, size: data.length }, create: { id: ID, userId: "system", name: ID, mime: "application/json", size: data.length, data } });
}
const clean = (s, n = 200) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);

export async function listComplaints({ uid } = {}) {
  const all = await load();
  return uid ? all.filter((c) => c.by?.uid === uid) : all;
}

export async function fileComplaint(input, who) {
  const list = await load();
  const now = new Date().toISOString();
  const c = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    no: (list.reduce((m, x) => Math.max(m, x.no || 0), 1000)) + 1,
    at: now, updatedAt: now, status: "open",
    by: { uid: who.uid, name: who.name, agentId: who.agentId || "" },
    customer: clean(input.customer, 100), phone: clean(input.phone, 40), account: clean(input.account, 80),
    category: CATEGORIES.includes(input.category) ? input.category : "Other",
    priority: PRIORITIES.includes(input.priority) ? input.priority : "normal",
    text: clean(input.text, 5000), wants: clean(input.wants, 500),
    notes: [],
  };
  if (!c.text) throw new Error("Write what the customer said.");
  list.unshift(c); await save(list);
  return c;
}

// Admin: change status / priority, add a reply. Agent: add a note to their own complaint.
export async function updateComplaint(id, patch, who, isAdmin) {
  const list = await load();
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error("Complaint not found.");
  if (!isAdmin && c.by?.uid !== who.uid) throw new Error("Not allowed.");
  const now = new Date().toISOString(); const changes = [];
  if (isAdmin && STATUSES.includes(patch.status) && patch.status !== c.status) { c.status = patch.status; changes.push("status → " + patch.status); if (patch.status === "resolved") c.resolvedAt = now; }
  if (isAdmin && PRIORITIES.includes(patch.priority) && patch.priority !== c.priority) { c.priority = patch.priority; changes.push("priority → " + patch.priority); }
  const note = clean(patch.note, 2000);
  if (note) c.notes.push({ at: now, by: who.name || (isAdmin ? "Admin" : "Agent"), admin: !!isAdmin, text: note });
  c.updatedAt = now; await save(list);
  return { c, changes, note };
}
export async function deleteComplaint(id) { await save((await load()).filter((x) => x.id !== id)); }
