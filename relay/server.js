// Modo Cloud Relay — a tiny always-on forwarder with a FIXED outgoing IP (free on Render).
// Modo sends its VICIdial requests here; this server passes them to your dialer and signs itself in on the
// dialer's firewall page, so the dialer always sees the same allowed IP. Only your dialer's host is allowed.
// Env: MODO_URL (e.g. https://modo-crm1.vercel.app), RELAY_KEY (from Modo → Dialer setup → Relay).
"use strict";
const http = require("http");
const https = require("https");

const MODO = String(process.env.MODO_URL || "").replace(/\/+$/, "");
const KEY = process.env.RELAY_KEY || "";
const PORT = Number(process.env.PORT) || 10000;
const SELF = String(process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || "").replace(/\/+$/, "");
let allowed = [];
const log = (...a) => console.log(new Date().toISOString(), ...a);

function forward(req, res) {
  if (req.url === "/" || req.url === "/ping") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("modo-relay ok"); }
  if (req.method !== "POST" || req.url !== "/fwd") { res.writeHead(404); return res.end(); }
  if (!KEY || req.headers["x-relay-key"] !== KEY) { res.writeHead(401); return res.end("bad key"); }
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on("end", () => {
    let job; try { job = JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad json"); }
    let u; try { u = new URL(job.url); } catch { res.writeHead(400); return res.end("bad url"); }
    if (!allowed.includes(u.hostname.toLowerCase())) { res.writeHead(403, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "host not allowed: " + u.hostname })); }
    const lib = u.protocol === "http:" ? http : https;
    const out = lib.request(u, { method: job.method || "GET", headers: job.headers || {}, rejectUnauthorized: false, timeout: 15000 }, (r) => {
      const chunks = []; r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: r.statusCode, headers: { "content-type": r.headers["content-type"] || "", location: r.headers.location || "", "set-cookie": r.headers["set-cookie"] || [] }, body: Buffer.concat(chunks).toString("utf8") }));
      });
    });
    out.on("timeout", () => out.destroy(new Error("dialer timeout")));
    out.on("error", (e) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: e.message })); });
    if (job.body) out.write(job.body);
    out.end();
  });
}

async function register() {
  if (!MODO || !KEY || !SELF) return log("Set MODO_URL and RELAY_KEY (and the public URL) to connect.");
  try {
    const r = await fetch(MODO + "/api/relay/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: KEY, url: SELF, kind: "cloud" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return log("Modo refused:", d.error || r.status);
    allowed = (d.hosts || []).map((h) => String(h).toLowerCase());
    log("Connected to Modo. Dialer:", allowed.join(", "));
  } catch (e) { log("Couldn't reach Modo:", e.message); }
}
http.createServer(forward).listen(PORT, () => { log("Modo Cloud Relay on port", PORT, SELF); register(); });
setInterval(register, 4 * 60 * 1000);
// Free hosts sleep after ~15 minutes without visitors: visit ourselves so the relay stays awake.
if (SELF) setInterval(() => fetch(SELF + "/ping").catch(() => {}), 10 * 60 * 1000);
