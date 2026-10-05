// Modo Relay — run this on ONE computer in your office (the network your dialer already allows).
// Modo's server on the internet sends its VICIdial requests here, and this PC passes them to the dialer,
// so the dialer's firewall sees your office IP instead of Vercel's ever-changing IPs.
// It uses a free Cloudflare quick tunnel (no account needed). Only your dialer's address is allowed through.
//
// Usage:  node modo-relay.js <MODO_URL> <RELAY_KEY>
// (The "Download Modo Relay" button in Modo → Dialer setup makes a .bat that runs this for you.)
"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const MODO = (process.argv[2] || process.env.MODO_URL || "").replace(/\/+$/, "");
const KEY = process.argv[3] || process.env.RELAY_KEY || "";
const PORT = 8787;
if (!MODO || !KEY) { console.log("Usage: node modo-relay.js <MODO_URL> <RELAY_KEY>"); process.exit(1); }

let allowed = []; // dialer hosts Modo said we may reach
let tunnelUrl = "";
const log = (...a) => console.log(new Date().toLocaleTimeString(), "·", ...a);

// ── 1. Local forwarder: only to the dialer, only with the key ──
function forward(req, res) {
  if (req.url === "/ping") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("modo-relay ok"); }
  if (req.method !== "POST" || req.url !== "/fwd") { res.writeHead(404); return res.end(); }
  if (req.headers["x-relay-key"] !== KEY) { res.writeHead(401); return res.end("bad key"); }
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on("end", () => {
    let job; try { job = JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad json"); }
    let u; try { u = new URL(job.url); } catch { res.writeHead(400); return res.end("bad url"); }
    if (!allowed.includes(u.hostname.toLowerCase())) { res.writeHead(403); return res.end("host not allowed: " + u.hostname); }
    const lib = u.protocol === "http:" ? http : https;
    const out = lib.request(u, { method: job.method || "GET", headers: job.headers || {}, rejectUnauthorized: false, timeout: 15000 }, (r) => {
      const chunks = []; r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: r.statusCode, headers: { "content-type": r.headers["content-type"] || "", location: r.headers.location || "" }, body }));
      });
    });
    out.on("timeout", () => out.destroy(new Error("dialer timeout")));
    out.on("error", (e) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: e.message })); });
    if (job.body) out.write(job.body);
    out.end();
  });
}
http.createServer(forward).listen(PORT, "127.0.0.1", () => log(`Local relay on 127.0.0.1:${PORT}`));

// ── 2. Tell Modo where we are (and keep telling it) ──
async function register() {
  if (!tunnelUrl) return;
  try {
    const r = await fetch(MODO + "/api/relay/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: KEY, url: tunnelUrl }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return log("Modo refused the relay:", d.error || r.status, "— download a fresh relay from Dialer setup.");
    allowed = (d.hosts || []).map((h) => String(h).toLowerCase());
    log(`Connected to Modo ✔  (dialer: ${allowed.join(", ") || "not set yet"})`);
  } catch (e) { log("Couldn't reach Modo:", e.message); }
}
setInterval(register, 4 * 60 * 1000);

// ── 3. Free Cloudflare quick tunnel ──
const BIN = { win32: "cloudflared-windows-amd64.exe", darwin: "cloudflared-darwin-amd64.tgz", linux: "cloudflared-linux-amd64" }[process.platform] || "cloudflared-linux-amd64";
const exe = path.join(__dirname, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
async function ensureCloudflared() {
  if (fs.existsSync(exe)) return exe;
  if (process.platform === "darwin") { log("On Mac: install cloudflared with `brew install cloudflared`, then run again."); return "cloudflared"; }
  log("Downloading cloudflared (one time, ~50 MB)…");
  const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${BIN}`);
  if (!r.ok) throw new Error("download failed " + r.status);
  fs.writeFileSync(exe, Buffer.from(await r.arrayBuffer()));
  if (process.platform !== "win32") fs.chmodSync(exe, 0o755);
  return exe;
}
async function startTunnel() {
  const bin = await ensureCloudflared();
  log("Opening secure tunnel…");
  const p = spawn(bin, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], { windowsHide: true });
  const scan = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== tunnelUrl) { tunnelUrl = m[0]; log("Tunnel ready:", tunnelUrl); setTimeout(register, 3000); }
  };
  p.stdout.on("data", scan); p.stderr.on("data", scan);
  p.on("exit", (code) => { log("Tunnel stopped (" + code + "). Restarting in 5s…"); tunnelUrl = ""; setTimeout(startTunnel, 5000); });
}
startTunnel().catch((e) => { log("Couldn't start the tunnel:", e.message); process.exit(1); });
log("Modo Relay starting. Keep this window open while your team uses the dialer.");
