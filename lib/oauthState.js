import crypto from "crypto";
// Signed OAuth "state": proves the sign-in came from this Modo and this admin, without cookies
// (phones often open Google's page in another browser/app where Modo's cookie isn't there).
const key = () => crypto.createHash("sha256").update("modo-oauth:" + (process.env.JWT_SECRET || "dev-secret")).digest();
export function makeState(uid, extra = "") {
  const body = Buffer.from(JSON.stringify({ u: uid, t: Date.now(), x: extra, n: crypto.randomBytes(6).toString("hex") })).toString("base64url");
  return body + "." + crypto.createHmac("sha256", key()).update(body).digest("base64url");
}
export function readState(state, maxAgeMs = 30 * 60000) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { const d = JSON.parse(Buffer.from(body, "base64url").toString()); return Date.now() - d.t < maxAgeMs ? d : null; } catch { return null; }
}
