import crypto from "crypto";
// Short-lived signed download links: they carry their own permission, so a download that opens in another
// window/app (Windows app, phone app, new tab) works without the Modo sign-in cookie.
const key = () => crypto.createHash("sha256").update("modo-dl:" + (process.env.JWT_SECRET || "dev-secret")).digest();
const mac = (s) => crypto.createHmac("sha256", key()).update(s).digest("base64url");
export function signParams(path, params = {}, ttlSec = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const q = new URLSearchParams({ ...params, exp: String(exp) });
  q.set("sig", mac(path + "?" + new URLSearchParams({ ...params, exp: String(exp) }).toString()));
  return path + "?" + q.toString();
}
export function checkSigned(req, path) {
  const u = new URL(req.url); const sig = u.searchParams.get("sig"); const exp = Number(u.searchParams.get("exp"));
  if (!sig || !exp || exp < Date.now() / 1000) return false;
  const p = new URLSearchParams(u.searchParams); p.delete("sig");
  const want = mac(path + "?" + p.toString());
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
