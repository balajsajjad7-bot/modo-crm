// Modo WhatsApp (linked number, like WhatsApp Web), Modo side.
// The WhatsApp connection itself runs in the Modo Cloud Relay (relay/whatsapp.js). Here we keep its saved
// login, its status/QR, the settings (admin numbers, AI auto-reply) and an outbox for messages to send.
// Everything is stored encrypted in FileBlob rows with fixed ids, so no database changes are needed.
import { db } from "./db";
import { enc, dec } from "./crypto";
import { viciConnector, sameKey } from "./relay";

const AUTH = "walink-auth", STATUS = "walink-status", SETTINGS = "walink-settings", OUTBOX = "walink-outbox";

async function getBlob(id) {
  const b = await db.fileBlob.findUnique({ where: { id } }).catch(() => null);
  if (!b) return null;
  try { return JSON.parse(dec(Buffer.from(b.data).toString("utf8"))); } catch { return null; }
}
async function putBlob(id, obj) {
  const data = Buffer.from(enc(JSON.stringify(obj)), "utf8");
  await db.fileBlob.upsert({ where: { id }, update: { data, size: data.length }, create: { id, userId: "system", name: id, mime: "application/json", size: data.length, data } });
}
const delBlob = (id) => db.fileBlob.deleteMany({ where: { id } });

// Relay requests carry the relay key (the same one as the dialer relay).
export async function relayAuth(req) {
  const conn = await viciConnector();
  return conn && sameKey(req.headers.get("x-relay-key"), conn.cfg.relayKey) ? conn : null;
}
export async function relayTarget() {
  const conn = await viciConnector();
  return conn?.cfg?.relayUrl && conn?.cfg?.relayKey ? { url: conn.cfg.relayUrl.replace(/\/+$/, ""), key: conn.cfg.relayKey } : null;
}

// Saved WhatsApp login (raw JSON text from the relay, already BufferJSON-encoded)
export async function loadAuth() { const a = await getBlob(AUTH); return a?.text || ""; }
export async function saveAuth(text) { await putBlob(AUTH, { text: String(text).slice(0, 8e6) }); }
export async function wipeAuth() { await delBlob(AUTH); }

export async function getStatus() { return (await getBlob(STATUS)) || { state: "not_set_up" }; }
export async function setStatus(patch) { const cur = await getStatus(); const next = { ...cur, ...patch, at: new Date().toISOString() }; await putBlob(STATUS, next); return next; }
export async function linked() { const s = await getStatus(); return s.state === "open" && s.at && Date.now() - new Date(s.at) < 3 * 24 * 3600000 ? s : null; }

export async function getSettings() { return (await getBlob(SETTINGS)) || { admins: "", aiReply: "on" }; }
export async function saveSettings(patch) { const next = { ...(await getSettings()), ...patch }; await putBlob(SETTINGS, next); return next; }

// Outbox: messages waiting for the relay (used when the relay is asleep or offline)
export async function queue(to, text) {
  const box = (await getBlob(OUTBOX)) || { items: [] };
  box.items = [...box.items, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to: String(to), text: String(text).slice(0, 4000), at: new Date().toISOString() }].slice(-200);
  await putBlob(OUTBOX, box);
}
export async function takeOutbox() {
  const box = (await getBlob(OUTBOX)) || { items: [] };
  const fresh = box.items.filter((i) => Date.now() - new Date(i.at) < 24 * 3600000);
  return fresh.slice(0, 30);
}
export async function ackOutbox(done = []) {
  const box = (await getBlob(OUTBOX)) || { items: [] };
  box.items = box.items.filter((i) => !done.includes(i.id) && Date.now() - new Date(i.at) < 24 * 3600000);
  await putBlob(OUTBOX, box);
}

// Send through the linked number: straight to the relay, or queue it if the relay doesn't answer.
export async function sendLinked(to, text) {
  const t = await relayTarget();
  if (t) {
    try {
      const r = await fetch(t.url + "/wa/send", { method: "POST", headers: { "content-type": "application/json", "x-relay-key": t.key }, body: JSON.stringify({ to, text }), signal: AbortSignal.timeout(20000) });
      if (r.ok) return { ok: true };
    } catch {}
  }
  await queue(to, text);
  if (t) fetch(t.url + "/ping", { signal: AbortSignal.timeout(5000) }).catch(() => {}); // wake a sleeping relay; it sends the queue when it's back
  return { ok: true, queued: true };
}

export async function relayCall(path, body) {
  const t = await relayTarget();
  if (!t) throw new Error("The Modo Cloud Relay isn't set up yet (Dialer setup → Relay).");
  const r = await fetch(t.url + path, { method: "POST", headers: { "content-type": "application/json", "x-relay-key": t.key }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(30000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The relay didn't answer (it may be waking up — try again in a minute).");
  return d;
}
