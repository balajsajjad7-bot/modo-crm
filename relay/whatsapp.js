// Modo WhatsApp (linked like WhatsApp Web) — runs inside the Modo Cloud Relay.
// You link a WhatsApp number once by scanning a QR code (or typing a pairing code) in Modo → WhatsApp.
// The login is saved (encrypted) in Modo, so restarts don't need a new scan.
// Incoming chats go to Modo; Modo answers with replies that this module sends. Modo can also push messages
// (alerts, agent replies) to POST /wa/send.
// Unofficial: WhatsApp may ban numbers used for bots or bulk messages — use a separate business number.
"use strict";

const MODO = String(process.env.MODO_URL || "").replace(/\/+$/, "");
const KEY = process.env.RELAY_KEY || "";
const log = (...a) => console.log(new Date().toISOString(), "[wa]", ...a);

let B = null;            // the Baileys module (ESM, loaded with import())
let sock = null, state = "starting", qr = "", me = "", lastErr = "", connecting = false, stopped = false;
let pairNumber = "";      // set when Modo asks for a pairing code instead of a QR
const jidOf = new Map();  // phone digits → the chat id to reply to (WhatsApp may use hidden "LID" ids)

const modo = (path, opts = {}) => fetch(MODO + path, { ...opts, headers: { "content-type": "application/json", "x-relay-key": KEY, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 30000) });

let lastReport = { ok: null, at: "", error: "" };
async function report(extra = {}) {
  try {
    const r = await modo("/api/wa-link/event", { method: "POST", body: JSON.stringify({ type: "status", state, qr, me, error: lastErr, ...extra }) });
    lastReport = { ok: r.ok, at: new Date().toISOString(), error: r.ok ? "" : "Modo answered " + r.status };
  } catch (e) { lastReport = { ok: false, at: new Date().toISOString(), error: e.message }; log("status report failed:", e.message); }
}
// For the relay's /health page (no QR, no keys)
function info() { return { loaded: true, state, hasQr: !!qr, linkedNumber: me ? me.slice(0, 4) + "…" + me.slice(-2) : "", error: lastErr, lastReportToModo: lastReport }; }

// ── Auth state kept in Modo (so a free host that restarts or sleeps doesn't lose the login) ──
async function loadAuth() {
  const r = await modo("/api/wa-link/auth").catch(() => null);
  const txt = r && r.ok ? await r.text() : "";
  let data = null; try { data = txt ? JSON.parse(txt, B.BufferJSON.reviver) : null; } catch { data = null; }
  const creds = data?.creds || B.initAuthCreds();
  const keys = data?.keys || {};
  let timer = null;
  const save = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try { await modo("/api/wa-link/auth", { method: "POST", body: JSON.stringify({ creds, keys }, B.BufferJSON.replacer), timeout: 60000 }); } catch (e) { log("saving login failed:", e.message); }
  }, 4000); };
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          for (const id of ids) { let v = keys[`${type}-${id}`]; if (v && type === "app-state-sync-key") v = B.proto.Message.AppStateSyncKeyData.fromObject(v); out[id] = v || null; }
          return out;
        },
        set: async (data) => { for (const t in data) for (const id in data[t]) { const v = data[t][id]; if (v) keys[`${t}-${id}`] = v; else delete keys[`${t}-${id}`]; } save(); },
      },
    },
    saveCreds: async () => save(),
    wipe: async () => { await modo("/api/wa-link/auth", { method: "DELETE" }).catch(() => {}); },
  };
}

const textOf = (m) => m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || m?.buttonsResponseMessage?.selectedDisplayText || m?.listResponseMessage?.title || "";
const kindOf = (m) => (!m ? "unknown" : m.conversation || m.extendedTextMessage ? "text" : m.imageMessage ? "image" : m.audioMessage ? "audio" : m.videoMessage ? "video" : m.documentMessage ? "document" : m.stickerMessage ? "sticker" : m.locationMessage ? "location" : "other");
const digits = (s) => String(s || "").split("@")[0].split(":")[0].replace(/\D/g, "");

async function sendText(to, text) {
  if (!sock || state !== "open") throw new Error("WhatsApp isn't connected");
  const d = digits(to);
  const jid = String(to).includes("@") ? to : jidOf.get(d) || `${d}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: String(text || "").slice(0, 4000) });
}

async function flushOutbox() {
  try {
    const r = await modo("/api/wa-link/outbox"); if (!r.ok) return;
    const { items = [] } = await r.json();
    const done = [], failed = [];
    for (const it of items) { try { await sendText(it.to, it.text); done.push(it.id); } catch (e) { failed.push({ id: it.id, error: e.message }); } await new Promise((ok) => setTimeout(ok, 1200)); }
    if (done.length || failed.length) await modo("/api/wa-link/outbox", { method: "POST", body: JSON.stringify({ done, failed }) });
  } catch (e) { log("outbox:", e.message); }
}

async function onMessage(msg) {
  try {
    if (!msg?.message || msg.key?.fromMe) return;
    const remote = msg.key.remoteJid || "";
    if (remote.endsWith("@g.us") || remote === "status@broadcast" || remote.endsWith("@newsletter")) return;
    const phoneJid = msg.key.remoteJidAlt && !msg.key.remoteJidAlt.endsWith("@lid") ? msg.key.remoteJidAlt : !remote.endsWith("@lid") ? remote : "";
    const from = digits(phoneJid || remote);
    jidOf.set(from, remote);
    const m = msg.message.ephemeralMessage?.message || msg.message.viewOnceMessage?.message || msg.message;
    const body = { type: "message", id: msg.key.id, from, hiddenNumber: !phoneJid, name: msg.pushName || "", text: textOf(m), kind: kindOf(m) };
    const r = await modo("/api/wa-link/event", { method: "POST", body: JSON.stringify(body), timeout: 60000 });
    const d = await r.json().catch(() => ({}));
    for (const t of d.replies || []) { await sock.sendPresenceUpdate("composing", remote).catch(() => {}); await sendText(remote, t); }
  } catch (e) { log("message handling failed:", e.message); }
}

async function connect() {
  if (connecting || stopped) return;
  connecting = true;
  try {
    if (!B) B = await import("@whiskeysockets/baileys");
    const auth = await loadAuth();
    const { version } = await Promise.race([B.fetchLatestBaileysVersion(), new Promise((ok) => setTimeout(() => ok({}), 8000))]).catch(() => ({}));
    state = "starting"; await report();
    const silent = { level: "silent", trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return silent; } };
    sock = B.makeWASocket({ auth: auth.state, version, logger: silent, printQRInTerminal: false, browser: B.Browsers.appropriate("Modo"), markOnlineOnConnect: false, syncFullHistory: false, connectTimeoutMs: 30000 });
    // Watchdog: if WhatsApp doesn't answer within a minute, say so in Modo and try again.
    const mine = sock;
    setTimeout(async () => {
      if (sock !== mine || state !== "starting") return;
      lastErr = "Can't reach WhatsApp from the relay yet — retrying."; await report();
      try { mine.end(new Error("connect timeout")); } catch {}
      if (sock === mine) { sock = null; setTimeout(connect, 20000); }
    }, 60000);
    sock.ev.on("creds.update", auth.saveCreds);
    sock.ev.on("messages.upsert", ({ messages, type }) => { if (type === "notify") for (const m of messages) onMessage(m); });
    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        qr = u.qr; state = "qr"; lastErr = "";
        if (pairNumber && !auth.state.creds.registered) {
          try { const code = await sock.requestPairingCode(pairNumber); pairNumber = ""; await report({ pairCode: code }); return; } catch (e) { lastErr = "Pairing code failed: " + e.message; }
        }
        await report();
      }
      if (u.connection === "open") {
        state = "open"; qr = ""; lastErr = ""; me = digits(sock.user?.id);
        log("connected as", me); await report(); flushOutbox();
      }
      if (u.connection === "close") {
        if (sock !== mine) return;
        const code = u.lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === B.DisconnectReason.loggedOut;
        state = loggedOut ? "logged_out" : "reconnecting"; qr = "";
        lastErr = loggedOut ? "WhatsApp was unlinked on the phone. Link it again in Modo → WhatsApp." : code === 403 ? "WhatsApp refused this number (it may be banned)." : "";
        await report();
        sock = null; connecting = false;
        if (loggedOut) { await auth.wipe(); setTimeout(connect, 3000); }
        else setTimeout(connect, code === 403 ? 10 * 60000 : 4000);
      }
    });
  } catch (e) { lastErr = e.message; state = "error"; log("connect failed:", e.message); await report(); setTimeout(connect, 30000); }
  finally { connecting = false; }
}

// HTTP endpoints the relay server exposes for Modo (all need the relay key)
async function handle(req, res, raw) {
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  let b = {}; try { b = raw ? JSON.parse(raw) : {}; } catch {}
  if (req.url === "/wa/status") return send(200, { state, me, qr, error: lastErr });
  if (req.url === "/wa/send") {
    try { await sendText(b.to, b.text); return send(200, { ok: true }); } catch (e) { return send(503, { error: e.message }); }
  }
  if (req.url === "/wa/flush") { flushOutbox(); return send(200, { ok: true }); }
  if (req.url === "/wa/pair") {
    pairNumber = digits(b.number);
    if (!pairNumber) return send(400, { error: "Give the WhatsApp number with country code." });
    if (state === "open") return send(400, { error: "Already linked." });
    if (sock && qr) { try { const code = await sock.requestPairingCode(pairNumber); pairNumber = ""; await report({ pairCode: code }); return send(200, { code }); } catch (e) { return send(500, { error: e.message }); } }
    return send(200, { ok: true, pending: true });
  }
  if (req.url === "/wa/logout") {
    try { if (sock) await sock.logout(); } catch {}
    state = "logged_out"; me = ""; qr = ""; await report();
    return send(200, { ok: true });
  }
  return send(404, { error: "not found" });
}

function start() {
  if (!MODO || !KEY) return log("WhatsApp off: set MODO_URL and RELAY_KEY.");
  connect();
  setInterval(() => { if (state === "open") flushOutbox(); }, 5 * 60000); // catch anything Modo queued while we were away
}

module.exports = { info, start, handle };
