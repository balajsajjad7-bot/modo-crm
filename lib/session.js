// Edge-safe (used by middleware too)
import { SignJWT, jwtVerify } from "jose";
// The signing key must be secret. "dev-secret" is public (the code is on GitHub), so it is only ever used on a
// developer's own computer. In production without JWT_SECRET, the key is derived from the database URL, which
// only the server knows — nobody can forge a login.
const SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (s && s !== "dev-secret" && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") return "modo-session|" + (process.env.DATABASE_URL || "") + "|" + (process.env.ENCRYPTION_KEY || process.env.ENC_KEY || "");
  return s || "dev-secret";
})();
const key = () => new TextEncoder().encode(SECRET);
export const COOKIE = "modo_session";
export const SESSION_MAX = 30 * 24 * 3600; // 30 days — keep people signed in on their phones

export async function signSession(payload) {
  const { iat, exp, ...clean } = payload || {};
  return new SignJWT(clean).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(key());
}
export async function readSession(token) {
  if (!token) return null;
  try { const p = (await jwtVerify(token, key())).payload; return p.t ? null : p; } catch { return null; } // tickets are never sessions
}
// Short-lived ticket between "password OK" and "code OK"
export async function signTicket(payload) {
  return new SignJWT({ ...payload, t: "2fa" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(key());
}
export async function readTicket(token) {
  if (!token) return null;
  try { const p = (await jwtVerify(token, key())).payload; return p.t === "2fa" ? p : null; } catch { return null; }
}

// WhatsApp unlock pass: a separate short-lived cookie, issued only after the WhatsApp password is entered.
export const WA_COOKIE = "modo_wa";
export const WA_MAX = 30 * 60; // 30 minutes, then the WhatsApp password is asked again
export async function signWaPass(payload) {
  return new SignJWT({ ...payload, t: "wa" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(WA_MAX + "s").sign(key());
}
export async function readWaPass(token) {
  if (!token) return null;
  try { const p = (await jwtVerify(token, key())).payload; return p.t === "wa" ? p : null; } catch { return null; }
}
