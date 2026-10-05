import { configFor } from "./connectors";
import { relayOf, relayFetch } from "./relay";
// VICIdial Non-Agent API. Credentials come from Admin → Connectors (or .env), never from the browser.

// When Modo ran on localhost it sat on the same network as the dialer and could tolerate a
// self-signed / hostname-mismatched HTTPS cert. Live on Vercel, Node verifies certs strictly and
// the fetch throws. Most VICIdial boxes (especially on a nonstandard port) use a self-signed cert,
// so on a TLS error we transparently retry with certificate verification relaxed for that one call.
let _insecure = null;
async function insecureDispatcher() {
  if (_insecure !== null) return _insecure || undefined;
  try { const { Agent } = await import(/* webpackIgnore: true */ "undici"); _insecure = new Agent({ connect: { rejectUnauthorized: false } }); }
  catch { _insecure = false; }
  return _insecure || undefined;
}
const _isTls = (s) => /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|ERR_TLS|HANDSHAKE|altname|SSL/i.test(s);

// Optional proxy so Modo can reach a dialer that only allows a fixed IP: set it in Connectors → VICIdial.
let _vpxy = { url: undefined, agent: undefined };
export async function proxyDispatcher(proxy) {
  if (!proxy) return undefined;
  if (_vpxy.url === proxy) return _vpxy.agent;
  try { const { ProxyAgent } = await import(/* webpackIgnore: true */ "undici"); _vpxy = { url: proxy, agent: new ProxyAgent(proxy) }; }
  catch { _vpxy = { url: proxy, agent: undefined }; }
  return _vpxy.agent;
}

// One place all VICIdial HTTP goes through: proxy (if set), strict TLS first, then a cert-relaxed retry.
async function vfetch(url, timeout = 12000, dispatcher) {
  const opts = { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(timeout), ...(dispatcher ? { dispatcher } : {}) };
  try {
    return await fetch(url, opts);
  } catch (e) {
    const code = String(e?.cause?.code || e?.code || "") + " " + String(e?.cause?.message || e?.message || "");
    if (_isTls(code) && !dispatcher) { const d = await insecureDispatcher(); if (d) { try { return await fetch(url, { ...opts, dispatcher: d }); } catch (e2) { throw reachError(e2); } } }
    throw reachError(e);
  }
}
// Turn a low-level network failure into something the admin can act on — and name the localhost→live cause.
function reachError(e) {
  const code = String(e?.cause?.code || e?.code || ""), msg = String(e?.cause?.message || e?.message || ""), all = code + " " + msg;
  if (/ENOTFOUND|EAI_AGAIN/i.test(all)) return new Error("Couldn't find your dialer's address (DNS lookup failed). In Admin → Connectors, use its public domain or public IP — not a local name.");
  if (/ECONNREFUSED/i.test(all)) return new Error("Your dialer refused the connection. Check the address and that the port is open to the internet.");
  if (_isTls(all)) return new Error("Your dialer's HTTPS certificate can't be verified and the relaxed retry also failed. On the dialer, use a valid certificate — or reach it over its plain http:// address.");
  if (/abort|timeout|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|HeadersTimeout/i.test(all)) return new Error("Your dialer didn't answer in time. It's reachable but slow — or, most likely, it's blocking Modo's server by IP. It worked on localhost because that machine was on an allowed network; live Modo calls come from Vercel. Fix: in Modo → Dialer setup → Office relay, download Modo Relay and run it on a PC in your office (the network your dialer allows).");
  return new Error("Couldn't reach your VICIdial from the internet. It worked on localhost because that PC was on the same network / an allowed IP; live Modo runs on Vercel, whose IP your dialer likely blocks. Make the dialer address public and, in VICIdial, allow API access from any IP.");
}

// ── Safety: never lock the API user or flood the dialer ──
// VICIdial locks a user after repeated wrong-password attempts, and every agent screen polls every few
// seconds. So: after an auth failure Modo stops calling VICIdial for 5 minutes; after a network failure
// (firewall/timeout) it waits 30 seconds before trying again. Errors are returned instantly meanwhile.
const AUTH_RE = /invalid username|invalid user|bad password|too many (login|failed)|login attempts|account (is )?(locked|disabled)|user is (locked|inactive)/i;
let _hold = null; // { until, msg, kind }
function checkHold() { if (_hold && Date.now() < _hold.until) { const left = Math.ceil((_hold.until - Date.now()) / 1000); throw new Error(`${_hold.msg} (Modo paused dialer requests for ${left}s to protect your account.)`); } }
function holdFor(kind, msg, ms) { _hold = { kind, msg, until: Date.now() + ms }; }
export function clearHold() { _hold = null; }
export function holdState() { return _hold && Date.now() < _hold.until ? { ..._hold, seconds: Math.ceil((_hold.until - Date.now()) / 1000) } : null; }
const _good = new Map(); // remember which API address answered, so later calls hit one URL only

async function relayApiFetch(base, relPath, params, relay, opts) {
  const key = base + "|" + relPath;
  const list = _good.has(key) ? [_good.get(key), ...apiCandidates(base, relPath).filter((c) => c !== _good.get(key))] : apiCandidates(base, relPath);
  let last;
  for (const c of list) {
    const url = new URL(c);
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    let r, text;
    try { r = await relayFetch(relay, url, { timeout: Math.max(opts.timeout, 12000) }); text = (await r.text()).trim(); }
    catch (e) {
      // Relay down → try the direct way once before giving up
      return apiFetch(base, relPath, params, opts.proxy, { timeout: opts.timeout, bypassHold: opts.bypassHold, portal: opts.portal });
    }
    last = { r, text, tried: c + " (via office relay)" };
    if (r.status !== 404 && !/^\s*<(!doctype|html)/i.test(text)) {
      _good.set(key, c);
      if (AUTH_RE.test(text)) { if (!opts.bypassHold) holdFor("auth", "VICIdial rejected the API username/password. Fix them in Connectors → VICIdial", 5 * 60000); throw new Error("VICIdial rejected the API username/password. " + text.slice(0, 160)); }
      if (_hold?.kind === "network") _hold = null;
      return last;
    }
  }
  return last;
}

// ── Dialer firewall ("User Validation" page, ViciBox dynamic portal on port 446) ──
// Hosts like dialerlab only let in IPs that signed in on that page, and Vercel's IP changes. So Modo signs
// its own server in (with the VICIdial user/password) before calling the API, and again whenever a call
// can't get through. Auto-detected for dialerlab.com; any other host: set "Firewall page" in Dialer setup.
export function portalOf(cfg) {
  const base = cfg.url || process.env.VICIDIAL_URL || "";
  const user = cfg.portalUser || cfg.user || process.env.VICIDIAL_API_USER, pass = cfg.portalPass || cfg.pass || process.env.VICIDIAL_API_PASS;
  let url = cfg.portal || "";
  if (!url && /dialerlab\.com/i.test(base)) { try { url = `https://${new URL(base).hostname}:446/valid8.php`; } catch {} }
  if (url && /login\.php$/i.test(url)) url = url.replace(/login\.php$/i, "valid8.php");
  return url && user && pass ? { url, user, pass } : null;
}
let _portalAt = 0;
// Read the firewall page's own form (action + field names), so it works whatever the fields are called.
async function portalForm(loginUrl, disp) {
  const get = async (d) => fetch(loginUrl, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(8000), ...(d ? { dispatcher: d } : {}) });
  let r;
  try { r = await get(disp); }
  catch (e) { const code = String(e?.cause?.code || e?.code || "") + " " + String(e?.cause?.message || e?.message || ""); if (!_isTls(code)) throw e; r = await get(disp || (await insecureDispatcher())); }
  const html = await r.text();
  const cookie = (r.headers.getSetCookie?.() || [r.headers.get("set-cookie")]).filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  const form = (html.match(/<form[\s\S]*?<\/form>/i) || [html])[0];
  const action = (form.match(/<form[^>]*action=["']?([^"' >]+)/i) || [])[1] || "valid8.php";
  const method = ((form.match(/<form[^>]*method=["']?(\w+)/i) || [])[1] || "POST").toUpperCase();
  const inputs = [...form.matchAll(/<input[^>]*>/gi)].map((m) => m[0]).map((t) => ({ type: ((t.match(/type=["']?(\w+)/i) || [])[1] || "text").toLowerCase(), name: (t.match(/name=["']?([^"' >]+)/i) || [])[1], value: (t.match(/value=["']?([^"'>]*)/i) || [])[1] || "" })).filter((x) => x.name);
  const userField = (inputs.find((x) => ["text", "email"].includes(x.type) && /user|login|name|id/i.test(x.name)) || inputs.find((x) => ["text", "email"].includes(x.type)) || { name: "user" }).name;
  const passField = (inputs.find((x) => x.type === "password") || { name: "pass" }).name;
  const hidden = inputs.filter((x) => x.type === "hidden" || (x.type === "submit" && x.value));
  return { url: new URL(action, loginUrl).toString(), method, userField, passField, hidden, cookie };
}
export async function portalLogin(portal, proxy, force = false) {
  if (!portal) return null;
  if (!force && Date.now() - _portalAt < 10 * 60000) return "recent";
  const disp = await proxyDispatcher(proxy);
  const loginUrl = portal.url.replace(/valid8\.php$/i, "login.php");
  let f;
  try { f = await portalForm(loginUrl, disp); }
  catch (e) { throw new Error("Couldn't open the dialer's firewall page (" + loginUrl + "): " + (e?.cause?.message || e.message)); }
  const body = new URLSearchParams();
  f.hidden.forEach((h) => body.set(h.name, h.value));
  body.set(f.userField, portal.user); body.set(f.passField, portal.pass);
  const send = async (d) => fetch(f.method === "GET" ? f.url + "?" + body : f.url, { method: f.method, headers: { "content-type": "application/x-www-form-urlencoded", referer: loginUrl, ...(f.cookie ? { cookie: f.cookie } : {}) }, body: f.method === "GET" ? undefined : body, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(10000), ...(d ? { dispatcher: d } : {}) });
  let r;
  try { r = await send(disp); }
  catch (e) { const code = String(e?.cause?.code || e?.code || "") + " " + String(e?.cause?.message || e?.message || ""); if (!_isTls(code)) throw new Error("Firewall sign-in failed: " + (e?.cause?.message || e.message)); r = await send(disp || (await insecureDispatcher())); }
  const text = (await r.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (/invalid|incorrect|denied|fail|wrong|not valid/i.test(text) && !/success|validated|allowed|welcome|granted|added/i.test(text)) throw new Error("The dialer's firewall page rejected the login: " + text.slice(0, 160));
  _portalAt = Date.now();
  return `signed in (${f.userField}/${f.passField} → ${new URL(f.url).pathname}): ${text.slice(0, 140) || "ok"}`;
}

// VICIdial installs live at different web paths, so try the common ones and use whichever answers
// with real API data (not a 404 or an HTML page).
function apiCandidates(base, relPath) {
  const u = new URL(base); const origin = u.origin; const file = relPath.split("/").pop();
  const set = new Set([`${origin}/${relPath}`, `${origin}/${file}`]);
  const dir = u.pathname.replace(/\/[^/]*$/, ""); // directory of the configured URL
  if (dir && dir !== "/") { set.add(`${origin}${dir}/${file}`); set.add(`${origin}${dir}/${relPath}`); }
  return [...set];
}
export async function apiFetch(base, relPath, params, proxy, { timeout = 7000, bypassHold = false, portal = null, retried = false, relay = null } = {}) {
  if (!bypassHold) checkHold();
  // Office relay online → everything goes through it (the dialer sees your office IP). No firewall sign-in needed.
  if (relay) return relayApiFetch(base, relPath, params, relay, { bypassHold, portal, proxy, timeout });
  if (portal) await portalLogin(portal, proxy).catch(() => {});
  const disp = await proxyDispatcher(proxy);
  const key = base + "|" + relPath;
  const list = _good.has(key) ? [_good.get(key), ...apiCandidates(base, relPath).filter((c) => c !== _good.get(key))] : apiCandidates(base, relPath);
  let last;
  for (const c of list) {
    const url = new URL(c);
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    let r, text;
    try { r = await vfetch(url, timeout, disp); text = (await r.text()).trim(); }
    catch (e) {
      // Blocked by the firewall (new Vercel IP)? Sign in on the firewall page and try once more.
      if (portal && !retried) { try { await portalLogin(portal, proxy, true); return await apiFetch(base, relPath, params, proxy, { timeout, bypassHold, portal, retried: true }); } catch (e2) { e = e2; } }
      if (!bypassHold) holdFor("network", e.message, portal ? 6000 : 30000); throw e;
    }
    last = { r, text, tried: c };
    // A real API hit: not a 404 and not an HTML page (an "ERROR: ..." body is still a valid hit).
    if (r.status !== 404 && !/^\s*<(!doctype|html)/i.test(text)) {
      _good.set(key, c);
      if (AUTH_RE.test(text)) { if (!bypassHold) holdFor("auth", "VICIdial rejected the API username/password. Fix them in Connectors → VICIdial", 5 * 60000); throw new Error("VICIdial rejected the API username/password. Fix them in Connectors → VICIdial. " + text.slice(0, 160)); }
      if (_hold?.kind === "network") _hold = null;
      return last;
    }
  }
  return last;
}

export async function loggedInAgents(override) {
  const cfg = override || (await configFor("vicidial")) || {};
  const base = cfg.url || process.env.VICIDIAL_URL, user = cfg.user || process.env.VICIDIAL_API_USER, pass = cfg.pass || process.env.VICIDIAL_API_PASS;
  if (!base || !user) throw new Error("VICIdial isn't connected yet. Add it in Admin → Connectors.");
  const params = { source: "crmmodo", user, pass, function: "logged_in_agents", stage: "pipe", header: "YES" };
  // Only your team: filter to your campaign(s) and/or user group(s) set in the connector (pipe-separated).
  if (cfg.campaigns) params.campaigns = cfg.campaigns.split(",").map((x) => x.trim()).filter(Boolean).join("|");
  if (cfg.userGroups) params.user_groups = cfg.userGroups.split(",").map((x) => x.trim()).filter(Boolean).join("|");
  const { r, text, tried } = await apiFetch(base, "vicidial/non_agent_api.php", params, cfg.proxy, { portal: portalOf(cfg), relay: relayOf(cfg) });
  if (r.status === 404 || /<html|<!doctype/i.test(text)) throw new Error(`Couldn't find the VICIdial API (HTTP ${r.status}) at ${tried}. Open that address in a browser: if it 404s, your dialer's API is at a different address or port — set the correct base URL in Connectors → VICIdial (e.g. https://your-dialer:PORT). If it shows an "IP not allowed" page, whitelist Modo's server / allow API from any IP.`);
  if (!r.ok && !text) throw new Error(`Your dialer answered with HTTP ${r.status}. If it's 401/403 it's blocking Modo's server (IP restriction) — allow API access from any IP in VICIdial.`);
  if (/^ERROR/i.test(text)) throw new Error(text.replace(/^ERROR:?\s*/i, "VICIdial: "));
  const lines = text.split("\n").filter(Boolean);
  const head = lines.shift().split("|").map((h) => h.trim().toLowerCase());
  return lines.map((l) => Object.fromEntries(l.split("|").map((v, i) => [head[i] || `f${i}`, v.trim()])));
}

async function call(fn, params, override) {
  const cfg = override || (await configFor("vicidial")) || {};
  const base = cfg.url || process.env.VICIDIAL_URL, user = cfg.user || process.env.VICIDIAL_API_USER, pass = cfg.pass || process.env.VICIDIAL_API_PASS;
  if (!base || !user) throw new Error("VICIdial isn't connected yet. Add it in Admin → Connectors.");
  const { text } = await apiFetch(base, "vicidial/non_agent_api.php", { source: "crmmodo", user, pass, function: fn, ...params }, cfg.proxy, { portal: portalOf(cfg), relay: relayOf(cfg) });
  return { cfg, text };
}

// Live status of one agent (includes their conference session_id)
export async function agentStatus(agentUser) {
  const { cfg, text } = await call("agent_status", { agent_user: agentUser, stage: "pipe", header: "YES", include_ip: "NO" });
  if (/^ERROR/i.test(text)) throw new Error(text);
  const [h, v] = text.split("\n").filter(Boolean);
  if (!v) throw new Error(`${agentUser} isn't logged into VICIdial.`);
  const head = h.split("|").map((x) => x.trim().toLowerCase());
  return { cfg, row: Object.fromEntries(v.split("|").map((x, i) => [head[i] || `f${i}`, x.trim()])) };
}

// VICIdial's own listen-in: it rings YOUR phone and silently joins it to the agent's call (both sides, mixed by Asterisk).
// stage: MONITOR (listen), WHISPER (talk to agent only), BARGE (join the call)
export async function blindMonitor(agentUser, stage = "MONITOR") {
  const { cfg, row } = await agentStatus(agentUser);
  const phone = cfg.monitorPhone || process.env.VICIDIAL_MONITOR_PHONE;
  if (!phone) throw new Error("Add your phone login in Admin → Connectors → VICIdial → Monitor phone.");
  const session = row.session_id || row.conf_exten || row.session;
  if (!session) throw new Error(`Couldn't find ${agentUser}'s dialer session. Are they logged into VICIdial?`);
  const server = row.server_ip || cfg.serverIp || process.env.VICIDIAL_SERVER_IP;
  if (!server) throw new Error("Add the dialer server IP in Admin → Connectors → VICIdial → Server IP.");
  const { text } = await call("blind_monitor", { phone_login: phone, session_id: session, server_ip: server, stage: ["MONITOR", "WHISPER", "BARGE"].includes(stage) ? stage : "MONITOR" });
  if (!/^SUCCESS/i.test(text)) throw new Error(text || "VICIdial didn't answer.");
  return { phone, status: row.status, text };
}

// ── Agent API (controls a logged-in agent's VICIdial session from Modo) ──
export async function agentApi(fn, agentUser, params = {}) {
  const cfg = (await configFor("vicidial")) || {};
  const base = cfg.url || process.env.VICIDIAL_URL, user = cfg.user || process.env.VICIDIAL_API_USER, pass = cfg.pass || process.env.VICIDIAL_API_PASS;
  if (!base || !user) throw new Error("VICIdial isn't connected yet. Ask admin to add it in Connectors.");
  const p = { source: "crmmodo", user, pass, agent_user: agentUser, function: fn, ...params };
  Object.keys(p).forEach((k) => (p[k] === "" || p[k] == null) && delete p[k]);
  const { text } = await apiFetch(base, "agc/api.php", p, cfg.proxy, { portal: portalOf(cfg), relay: relayOf(cfg) });
  if (/^ERROR/i.test(text)) throw new Error(text.replace(/^ERROR:\s*/i, "VICIdial: "));
  return text;
}

// Everything VICIdial knows about a lead (name, address…). Best effort: older VICIdials may not have this function.
const _leads = new Map(); // lead_id → { at, data }  (lead details barely change during a call)
export async function leadInfo(leadId) {
  const hit = _leads.get(String(leadId));
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.data;
  const data = await leadInfoFresh(leadId);
  if (_leads.size > 500) _leads.clear();
  _leads.set(String(leadId), { at: Date.now(), data });
  return data;
}
async function leadInfoFresh(leadId) {
  try {
    const { text } = await call("lead_all_info", { lead_id: leadId, header: "YES", stage: "pipe" });
    if (/^ERROR/i.test(text)) return null;
    const [h, v] = text.split("\n").filter(Boolean); if (!v) return null;
    const head = h.split("|").map((x) => x.trim().toLowerCase());
    return Object.fromEntries(v.split("|").map((x, i) => [head[i] || `f${i}`, x.trim()]));
  } catch { return null; }
}

export async function dialerSettings() {
  const cfg = (await configFor("vicidial")) || {};
  const base = cfg.url || process.env.VICIDIAL_URL || "";
  const list = (s, d) => String(s || d).split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [code, ...l] = x.split(":"); return { code: code.trim().toUpperCase(), label: (l.join(":") || code).trim() }; });
  return {
    agentUrl: cfg.agentUrl || (base ? new URL("/agc/vicidial.php", base).toString() : ""),
    dispositions: list(cfg.dispositions, "SALE:Sale, NI:Not interested, CALLBK:Callback, NA:No answer, A:Answering machine, B:Busy, DNC:Do not call, N:Dead air"),
    pauseCodes: list(cfg.pauseCodes, "BREAK:Break, LUNCH:Lunch, TRAIN:Training, MEET:Meeting"),
  };
}

// ── Call recordings (VICIdial recording_lookup) ──
// Returns each recording's URL so the browser can play it. Needs the VICIdial API user to have API + View Reports.
export async function recordingLookup({ date, agentUser, leadId, phone } = {}) {
  const { cfg, text } = await call("recording_lookup", {
    date: date || undefined, agent_user: agentUser || undefined, lead_id: leadId || undefined, phone_number: phone || undefined,
    duration: "Y", stage: "pipe", header: "YES",
  });
  if (/^ERROR/i.test(text)) throw new Error(text.replace(/^ERROR:?\s*/i, "VICIdial: "));
  const lines = text.split("\n").filter(Boolean);
  if (!lines.length) return [];
  const head = lines.shift().split("|").map((h) => h.trim().toLowerCase());
  const base = cfg.url || process.env.VICIDIAL_URL || "";
  return lines.map((l) => {
    const o = Object.fromEntries(l.split("|").map((v, i) => [head[i] || `f${i}`, v.trim()]));
    let loc = o.location || o.recording_url || o.url || "";
    if (loc && !/^https?:/i.test(loc)) { try { loc = new URL(loc, base).toString(); } catch {} }
    return { id: o.recording_id || o.id, leadId: o.lead_id, agent: o.user || o.agent_user, phone: o.phone_number,
      start: o.start_time || o.start_epoch, seconds: Number(o.length_in_sec || o.duration || 0) || null, filename: o.filename, url: loc };
  }).filter((x) => x.url);
}
