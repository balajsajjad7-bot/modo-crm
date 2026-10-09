// Send a WhatsApp message to any number from the WhatsApp number linked in Modo (Setup → WhatsApp).
// The chat also appears in Admin → WhatsApp inbox, so replies come back into Modo.
import { db } from "./db";

export function waIntl(raw) {
  let n = String(raw || "").replace(/\D/g, "").replace(/^00/, "");
  if (n.length === 10 && /^[2-9]/.test(n)) n = "1" + n;               // US 10-digit
  else if (n.length === 11 && n.startsWith("03")) n = "92" + n.slice(1); // Pakistan mobile 03xx
  else if (n.length === 10 && n.startsWith("3")) n = "92" + n;          // Pakistan mobile without the 0
  return n;
}

// Is a WhatsApp number linked to Modo right now (QR-linked number or the Meta connector)?
export async function waReady() {
  try {
    const { linked } = await import("./walink"); if (await linked()) return "linked";
    const { waConfig } = await import("./whatsapp"); if (await waConfig()) return "meta";
  } catch {}
  return null;
}

export async function sendToNumber(raw, text, { name = "", uid = "modo-bot" } = {}) {
  const n = waIntl(raw);
  if (n.length < 11) return { ok: false, error: "That number looks incomplete. Add the country code, e.g. 92 300 1234567." };
  const body = String(text || "").trim(); if (!body) return { ok: false, error: "The message is empty." };
  const id = "wa-" + n;
  try {
    await db.conversation.upsert({ where: { id }, update: {}, create: { id, name: `WhatsApp · ${name ? String(name).slice(0, 30) + " " : ""}+${n}`, isGroup: true, topic: "WhatsApp chat — what you type here is sent on WhatsApp" } });
    const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
    await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: id, userId: u.id })), skipDuplicates: true });
    const { sendToCustomer } = await import("./waReply");
    const r = await sendToCustomer(id, body, uid);
    return r.ok ? { ok: true, queued: !!r.queued, to: n } : { ok: false, error: r.error || "WhatsApp didn't send.", to: n };
  } catch (e) {
    const { sendWA } = await import("./whatsapp"); // inbox tables unavailable: still send
    const r = await sendWA(n, body).catch((x) => ({ ok: false, error: x.message }));
    return r.ok ? { ok: true, to: n } : { ok: false, error: r.error || e.message, to: n };
  }
}
