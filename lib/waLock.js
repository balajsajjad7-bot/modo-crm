// WhatsApp password: a second lock in front of everything WhatsApp in Modo (inbox, customer chats, linking).
// • Stored only as a salted scrypt hash (memory-hard: N=2^15, r=8, p=1, 64-byte key) — the password itself is
//   never saved anywhere, and the hash can't be reversed or cheaply guessed even if the database leaked.
// • Unlocking gives a signed, httpOnly, same-site-strict cookie for 30 minutes, tied to that admin and to the
//   current password (changing the password signs every open session out of WhatsApp at once).
// • Wrong tries are throttled in the database: 5 tries → 15 min lock, then 30, 60 … and the admins are alerted.
import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { WA_COOKIE, readWaPass } from "./session";

const ID = "wa-lock";
const N = 32768, R = 8, P = 1, LEN = 64;
const scrypt = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(pw.normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? bad(e) : ok(k))));

export async function lockInfo() {
  const b = await db.fileBlob.findUnique({ where: { id: ID } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : null; } catch { return null; }
}
export async function setLock(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt);
  const v = { alg: "scrypt", N, r: R, p: P, salt: salt.toString("base64"), hash: hash.toString("base64"), ver: crypto.randomBytes(8).toString("hex"), setAt: new Date().toISOString() };
  const data = Buffer.from(JSON.stringify(v), "utf8");
  await db.fileBlob.upsert({ where: { id: ID }, update: { data, size: data.length }, create: { id: ID, userId: "system", name: ID, mime: "application/json", size: data.length, data } });
  return v;
}
export async function checkLock(password) {
  const v = await lockInfo(); if (!v) return false;
  const got = await scrypt(String(password || "").slice(0, 200), Buffer.from(v.salt, "base64"));
  const want = Buffer.from(v.hash, "base64");
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? v : false;
}
export function strongEnough(pw) {
  pw = String(pw || "");
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 200) return "That's too long.";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds < 3 && pw.length < 14) return "Mix upper- and lower-case letters, numbers and a symbol (or use 14+ characters).";
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwerty|modo)/i.test(pw)) return "That password is too easy to guess.";
  return "";
}

// Is WhatsApp open for this signed-in admin right now? → { ok, set }
export async function waOpen(session) {
  if (!session || session.role !== "ADMIN") return { ok: false, set: true };
  const v = await lockInfo();
  if (!v) return { ok: false, set: false };
  const pass = await readWaPass(cookies().get(WA_COOKIE)?.value);
  return { ok: !!pass && pass.uid === session.uid && pass.v === v.ver, set: true, exp: pass?.exp };
}
export const LOCKED = { error: "WhatsApp is locked. Enter your WhatsApp password.", waLocked: true };

// For routes: null when allowed, else the reason. Admins need the WhatsApp unlock; agents only reach WhatsApp
// chats an admin added them to (checked by the chat routes' membership rules).
export async function waBlocked(session) {
  if (!session) return { status: 401, body: { error: "Sign in first." } };
  if (session.role !== "ADMIN") return null;
  const o = await waOpen(session);
  return o.ok ? null : { status: 423, body: { ...LOCKED, set: o.set } };
}
