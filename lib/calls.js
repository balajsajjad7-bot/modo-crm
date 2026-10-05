import { db } from "./db";
// Modo's own call log: every call placed or wrapped up through Modo (VICIdial, Google Voice…).
// "Recent calls" reads this, so it works even when the dialer itself can't be reached from Modo's server.

const d10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const OPEN_MIN = 90; // a call with no end within 90 minutes is treated as finished

async function openCall(userId, phone) {
  const where = { userId, endedAt: null, startedAt: { gte: new Date(Date.now() - OPEN_MIN * 60000) } };
  if (phone) where.phone = d10(phone);
  return db.callLog.findFirst({ where, orderBy: { startedAt: "desc" } });
}

export async function startCall(userId, { phone, name, leadId, contactId, source = "vicidial" }) {
  const p = d10(phone); if (p.length < 10) return null;
  // Close anything left open first (one live call per person)
  await endCall(userId).catch(() => {});
  return db.callLog.create({ data: { userId, phone: p, name: name || null, leadId: leadId ? String(leadId) : null, contactId: contactId || null, source } });
}

export async function endCall(userId, { id, phone } = {}) {
  const c = id ? await db.callLog.findFirst({ where: { id, userId } }) : await openCall(userId, phone);
  if (!c || c.endedAt) return c;
  const endedAt = new Date();
  return db.callLog.update({ where: { id: c.id }, data: { endedAt, seconds: Math.round((endedAt - c.startedAt) / 1000) } });
}

// Save the result (disposition) on the most recent call to that number; create one if Modo never saw it start.
export async function saveResult(userId, { id, phone, name, code, label, note, source = "vicidial", seconds }) {
  let c = id ? await db.callLog.findFirst({ where: { id, userId } }) : null;
  if (!c && phone) c = await db.callLog.findFirst({ where: { userId, phone: d10(phone), startedAt: { gte: new Date(Date.now() - 6 * 3600000) } }, orderBy: { startedAt: "desc" } });
  const data = { result: label || code || null, resultCode: code || null, note: note ? String(note).slice(0, 2000) : null, ...(name ? { name } : {}) };
  if (c) {
    if (!c.endedAt) { const endedAt = new Date(); data.endedAt = endedAt; data.seconds = seconds ?? Math.round((endedAt - c.startedAt) / 1000); }
    return db.callLog.update({ where: { id: c.id }, data });
  }
  const p = d10(phone); if (p.length < 10) return null;
  return db.callLog.create({ data: { userId, phone: p, source, endedAt: new Date(), seconds: seconds ?? null, ...data } });
}

// Called from the dialer's status poll: VICIdial dialed a lead by itself → log it; call finished → close it.
export async function trackDialerStatus(userId, { status, phone, name, leadId }) {
  const inCall = ["INCALL", "QUEUE", "CLOSER"].includes(status);
  const p = d10(phone);
  if (inCall && p.length === 10) {
    const open = await openCall(userId, p);
    if (!open) await startCall(userId, { phone: p, name, leadId });
    else if (!open.name && name) await db.callLog.update({ where: { id: open.id }, data: { name } });
  } else if (!inCall) {
    await endCall(userId);
  }
}

export async function recentCalls({ userId, limit = 50, since } = {}) {
  return db.callLog.findMany({
    where: { ...(userId ? { userId } : {}), ...(since ? { startedAt: { gte: since } } : {}) },
    orderBy: { startedAt: "desc" }, take: Math.min(200, limit),
    include: { user: { select: { name: true } } },
  });
}
