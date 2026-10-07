// AES-256-GCM encryption for secrets stored in the database (SMTP passwords, API keys, 2-step sign-in keys).
// Key: ENCRYPTION_KEY from .env, or derived from JWT_SECRET if not set.
import crypto from "crypto";
// Never encrypt with the public "dev-secret" in production: without ENCRYPTION_KEY / JWT_SECRET the key comes
// from the database URL, which only the server knows. Values saved earlier with the old key still open (LEGACY).
const H = (s) => crypto.createHash("sha256").update(s).digest();
const strong = (s) => s && s !== "dev-secret" && s.length >= 16;
const MATERIAL = process.env.ENCRYPTION_KEY || (strong(process.env.JWT_SECRET) ? process.env.JWT_SECRET : process.env.NODE_ENV === "production" ? "modo-data|" + (process.env.DATABASE_URL || "") : "dev-secret");
const LEGACY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret";
const key = () => H(MATERIAL);
const keys = () => (MATERIAL === LEGACY ? [H(MATERIAL)] : [H(MATERIAL), H(LEGACY)]);
export function enc(text) {
  if (text == null) return text;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return "enc:v1:" + [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(":");
}
export function dec(text) {
  if (!text || !String(text).startsWith("enc:v1:")) return text; // older plain values still work
  const [iv, tag, data] = String(text).slice(7).split(":").map((x) => Buffer.from(x, "base64url"));
  for (const k of keys()) {
    try { const d = crypto.createDecipheriv("aes-256-gcm", k, iv); d.setAuthTag(tag); return Buffer.concat([d.update(data), d.final()]).toString("utf8"); } catch {}
  }
  return null;
}
