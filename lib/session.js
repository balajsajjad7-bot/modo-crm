// Edge-safe (used by middleware too)
import { SignJWT, jwtVerify } from "jose";
const key = () => new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");
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
