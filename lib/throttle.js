// Brute-force protection that survives restarts and works across every server instance (stored in the
// database, not in memory). Each key (an ID, an IP, "wa-unlock:<user>") gets a few tries per window; after that
// it is locked, and every new lock lasts twice as long as the last one (15 min → 30 → 60 … up to 24 h).
import crypto from "crypto";
import { db } from "./db";

const id = (key) => "thr-" + crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 40);
async function load(key) {
  const b = await db.fileBlob.findUnique({ where: { id: id(key) } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : null; } catch { return null; }
}
async function save(key, v) {
  const data = Buffer.from(JSON.stringify(v), "utf8"); const i = id(key);
  await db.fileBlob.upsert({ where: { id: i }, update: { data, size: data.length }, create: { id: i, userId: "system", name: "throttle", mime: "application/json", size: data.length, data } }).catch(() => {});
}

// → { blocked: false } or { blocked: true, wait: seconds }
export async function isBlocked(key) {
  const v = await load(key);
  if (v?.until && Date.now() < v.until) return { blocked: true, wait: Math.ceil((v.until - Date.now()) / 1000) };
  return { blocked: false };
}
export async function failed(key, { max = 5, windowMs = 15 * 60000, baseLockMs = 15 * 60000 } = {}) {
  const now = Date.now(); const v = (await load(key)) || { n: 0, first: now, locks: 0 };
  if (now - v.first > windowMs) { v.n = 0; v.first = now; }
  v.n++;
  if (v.n >= max) { v.locks = (v.locks || 0) + 1; v.until = now + Math.min(baseLockMs * 2 ** (v.locks - 1), 24 * 3600000); v.n = 0; v.first = now; }
  await save(key, v);
  return v.until && v.until > now ? { locked: true, wait: Math.ceil((v.until - now) / 1000) } : { locked: false, left: max - v.n };
}
export async function cleared(key) { await db.fileBlob.deleteMany({ where: { id: id(key) } }).catch(() => {}); }

// Only let something run once per `ms` across all servers (for public "tick" endpoints).
export async function once(key, ms) {
  const v = await load("once:" + key);
  if (v?.at && Date.now() - v.at < ms) return false;
  await save("once:" + key, { at: Date.now() });
  return true;
}

export const waitText = (s) => (s >= 3600 ? Math.ceil(s / 3600) + " hour(s)" : Math.max(1, Math.ceil(s / 60)) + " minute(s)");
