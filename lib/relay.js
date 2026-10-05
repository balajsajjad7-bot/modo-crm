import crypto from "crypto";
import { db } from "./db";
import { parse, seal } from "./connectors";

// Modo Relay: a small program on an office PC that your dialer's firewall already allows.
// Modo sends VICIdial requests to it through a free Cloudflare tunnel; the PC passes them on.
// Settings live in the VICIdial connector (encrypted): relayKey, relayUrl, relayAt.

export async function viciConnector() {
  const c = await db.connector.findFirst({ where: { type: "vicidial" }, orderBy: { createdAt: "desc" } });
  return c ? { id: c.id, cfg: parse(c) } : null;
}
export async function patchVici(id, patch) {
  const c = await db.connector.findUnique({ where: { id } });
  const cfg = { ...parse(c), ...patch };
  await db.connector.update({ where: { id }, data: { config: seal(cfg) } });
  return cfg;
}
export async function ensureRelayKey(conn, renew = false) {
  if (conn.cfg.relayKey && !renew) return conn.cfg.relayKey;
  const key = crypto.randomBytes(18).toString("hex");
  conn.cfg = await patchVici(conn.id, { relayKey: key, ...(renew ? { relayUrl: "", relayAt: "" } : {}) });
  return key;
}
export const relayOnline = (cfg) => !!(cfg?.relayUrl && cfg?.relayKey && cfg?.relayAt && Date.now() - new Date(cfg.relayAt) < 10 * 60000);
export const relayOf = (cfg) => (relayOnline(cfg) ? { url: cfg.relayUrl, key: cfg.relayKey } : null);
export const sameKey = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

// Send one HTTP request to the dialer through the relay; returns a normal Response (+ .relayCookies).
// Throws an error with .relayDown when the relay itself can't be reached, .dialerDown when the dialer didn't answer it.
export async function relayFetch(relay, url, { method = "GET", headers = {}, body, timeout = 15000 } = {}) {
  let r;
  try {
    r = await fetch(relay.url.replace(/\/+$/, "") + "/fwd", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(timeout),
      headers: { "content-type": "application/json", "x-relay-key": relay.key },
      body: JSON.stringify({ url: String(url), method, headers, body: body ? String(body) : undefined }),
    });
  } catch (e) { const x = new Error("Relay not reachable: " + (e?.cause?.message || e.message)); x.relayDown = true; throw x; }
  const d = await r.json().catch(() => null);
  if (r.status === 502 || d?.error) { const x = new Error("Through the relay, the dialer didn't answer: " + (d?.error || r.status)); x.dialerDown = true; throw x; }
  if (!r.ok || !d) { const x = new Error("Relay: HTTP " + r.status); x.relayDown = true; throw x; }
  const res = new Response(d.body ?? "", { status: d.status || 200, headers: { "content-type": d.headers?.["content-type"] || "text/plain" } });
  res.relayCookies = [].concat(d.headers?.["set-cookie"] || []);
  return res;
}
