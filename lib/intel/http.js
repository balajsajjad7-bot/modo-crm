// Shared fetch for Customer 360 connectors: timeout, polite User-Agent, JSON parse, and a small
// in-memory cache (Modo on Oracle is one long-running server, so this saves repeat calls to free
// APIs and never touches the database).
const UA = "ModoCRM/4.0 (customer verification; contact: admin)";
const cache = new Map(); // key -> { at, ttl, value }
const MAX = 800;

export async function getJSON(url, { headers = {}, timeout = 12000, method = "GET", body, ttl = 0, text = false } = {}) {
  const key = ttl ? method + " " + url + (body ? " " + (typeof body === "string" ? body : JSON.stringify(body)) : "") : null;
  if (key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  }
  const r = await fetch(url, {
    method, body: body && typeof body !== "string" ? JSON.stringify(body) : body,
    headers: { "user-agent": UA, accept: "application/json, text/plain, */*", ...headers },
    signal: AbortSignal.timeout(timeout), cache: "no-store", redirect: "follow",
  });
  const raw = await r.text();
  let json = null; if (!text) { try { json = JSON.parse(raw); } catch {} }
  const value = { ok: r.ok, status: r.status, json, text: raw };
  if (key && r.ok) {
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), ttl, value });
  }
  return value;
}

export const HOUR = 3600e3, DAY = 24 * HOUR;

// Run a source, time it, never throw. Returns { name, ok, ms, note, data }.
export async function source(name, fn) {
  const t = Date.now();
  try { const data = await fn(); return { name, ok: data !== null && data !== undefined, ms: Date.now() - t, data }; }
  catch (e) { return { name, ok: false, ms: Date.now() - t, note: String(e?.message || e).slice(0, 160) }; }
}

export const digits = (s) => String(s || "").replace(/\D/g, "");
export function usTen(p) { let d = digits(p); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d.length === 10 ? d : null; }
export const fmtPhone = (d) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
export function milesBetween(a, b) {
  const R = 3958.8, rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const money = (n) => (n == null || !isFinite(n) ? null : "$" + Math.round(n).toLocaleString("en-US"));
