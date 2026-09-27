// Time-based one-time codes (RFC 6238), compatible with Google Authenticator, Microsoft Authenticator, Authy.
import crypto from "crypto";
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newSecret() { const b = crypto.randomBytes(20); let bits = "", out = ""; for (const x of b) bits += x.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function decode(s) { let bits = ""; for (const ch of s.replace(/=+$/, "").toUpperCase()) { const v = A.indexOf(ch); if (v < 0) continue; bits += v.toString(2).padStart(5, "0"); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
export function code(secret, t = Date.now()) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac("sha1", decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
export function verify(secret, input) {
  const c = String(input || "").replace(/\D/g, ""); if (c.length !== 6 || !secret) return false;
  return [-1, 0, 1].some((w) => crypto.timingSafeEqual(Buffer.from(code(secret, Date.now() + w * 30000)), Buffer.from(c)));
}
export const otpauth = (secret, label) => `otpauth://totp/${encodeURIComponent("CRM Modo:" + label)}?secret=${secret}&issuer=${encodeURIComponent("CRM Modo")}&digits=6&period=30`;
