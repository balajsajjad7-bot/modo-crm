// Submit-sale controls (admin): an optional sale password every agent must type to submit a sale, and a per-agent
// switch to turn sale submission off. Checked on the server, so hiding the button isn't the only barrier.
// The password is kept only as a salted scrypt hash; wrong tries are throttled per agent.
import crypto from "crypto";
import { db } from "./db";

const ID = "sale-lock";
const N = 16384, R = 8, P = 1, LEN = 64;
const scrypt = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(String(pw).normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? bad(e) : ok(k))));

export async function saleLock() {
  const b = await db.fileBlob.findUnique({ where: { id: ID } }).catch(() => null);
  let v = {}; try { v = b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : {}; } catch {}
  return { blocked: Array.isArray(v.blocked) ? v.blocked : [], pw: v.pw || null };
}
async function save(v) {
  const data = Buffer.from(JSON.stringify(v), "utf8");
  await db.fileBlob.upsert({ where: { id: ID }, update: { data, size: data.length }, create: { id: ID, userId: "system", name: ID, mime: "application/json", size: data.length, data } });
}
export async function setSalePassword(password) {
  const v = await saleLock();
  if (!password) { v.pw = null; await save(v); return; }
  const salt = crypto.randomBytes(16);
  v.pw = { salt: salt.toString("base64"), hash: (await scrypt(password, salt)).toString("base64"), setAt: new Date().toISOString() };
  await save(v);
}
export async function setSaleBlocked(uid, off) {
  const v = await saleLock(); const s = new Set(v.blocked);
  if (off) s.add(uid); else s.delete(uid);
  v.blocked = [...s]; await save(v); return v.blocked;
}
export async function salesOffFor(uid) { return (await saleLock()).blocked.includes(uid); }

// The sale password is asked when the Sale section opens. A right password gives a short-lived unlock token
// (kept only in that open page's memory) that is sent with each sale. Changing the password cancels every token.
const UNLOCK_HOURS = 8;
const tokenKey = (pw) => crypto.createHash("sha256").update("sale-unlock|" + pw.hash + "|" + (process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || process.env.DATABASE_URL || "dev")).digest();
const sign = (pw, uid, exp) => crypto.createHmac("sha256", tokenKey(pw)).update(uid + "|" + exp).digest("base64url");
function tokenOk(pw, uid, token) {
  const [exp, mac] = String(token || "").split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(pw, uid, exp)); const got = Buffer.from(mac);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// May this person submit? Checks the switch and permission, then the password itself → null or { error, status }.
async function gate(session, v) {
  const admin = session.role === "ADMIN";
  if (!admin && v.blocked.includes(session.uid)) return { error: "Submitting sales is turned off for you. Ask your admin.", status: 403, off: true };
  const { can } = await import("./perms");
  if (!admin && !(await can(session, "submitSale"))) return { error: "Submitting sales isn't allowed for agents right now.", status: 403 };
  return null;
}
async function checkPassword(session, v, password) {
  const { isBlocked, failed, cleared, waitText } = await import("./throttle");
  const key = "salepw:" + session.uid; const bl = await isBlocked(key);
  if (bl.blocked) return { error: `Too many wrong sale passwords. Try again in ${waitText(bl.wait)}.`, status: 429, needPassword: true };
  if (!password) return { error: "Type the sale password.", status: 401, needPassword: true }; // a missing password isn't a wrong try
  const got = await scrypt(String(password).slice(0, 200), Buffer.from(v.pw.salt, "base64"));
  const want = Buffer.from(v.pw.hash, "base64");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    const r = await failed(key, { max: 5, windowMs: 15 * 60000, baseLockMs: 15 * 60000 });
    if (r.locked) { try { const { alert } = await import("./bots"); await alert(`salepw-${session.uid}-${Date.now()}`, `🔐 ${session.name} (${session.agentId}) typed the wrong sale password 5 times — locked for 15 minutes.`, { wa: false }); } catch {} }
    return { error: "Wrong sale password.", status: 401, needPassword: true };
  }
  await cleared(key);
  return null;
}

// Opening the Sale section: password → { token } or { error, status }.
export async function unlockSale(session, password) {
  const v = await saleLock();
  const g = await gate(session, v); if (g) return g;
  if (!v.pw) return { token: "" };
  const bad = await checkPassword(session, v, password); if (bad) return bad;
  const exp = String(Date.now() + UNLOCK_HOURS * 3600000);
  return { token: exp + "." + sign(v.pw, session.uid, exp) };
}

// Submitting a sale: needs a valid unlock token (or the password itself) → null if OK, or { error, status }.
export async function checkSaleSubmit(session, password, token) {
  if (!session) return null;
  const v = await saleLock();
  const g = await gate(session, v); if (g) return g;
  if (!v.pw) return null;
  if (token && tokenOk(v.pw, session.uid, token)) return null;
  if (!password) return { error: "The Sale section is locked again — type the sale password to open it.", status: 401, needPassword: true };
  return checkPassword(session, v, password);
}
