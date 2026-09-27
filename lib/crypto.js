// AES-256-GCM encryption for secrets stored in the database (SMTP passwords, API keys, 2-step sign-in keys).
// Key: ENCRYPTION_KEY from .env, or derived from JWT_SECRET if not set.
import crypto from "crypto";
const key = () => crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret").digest();
export function enc(text) {
  if (text == null) return text;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return "enc:v1:" + [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(":");
}
export function dec(text) {
  if (!text || !String(text).startsWith("enc:v1:")) return text; // older plain values still work
  try {
    const [iv, tag, data] = String(text).slice(7).split(":").map((x) => Buffer.from(x, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch { return null; }
}
