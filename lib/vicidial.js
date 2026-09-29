import { configFor } from "./connectors";
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
async function proxyDispatcher(proxy) {
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
  if (/abort|timeout|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|HeadersTimeout/i.test(all)) return new Error("Your dialer didn't answer in time. It's reachable but slow — or, most likely, it's blocking Modo's server by IP. It worked on localhost because that machine was on an allowed network; live Modo calls come from Vercel. In VICIdial allow outside API access (System Settings) or whitelist all IPs for the API.");
  return new Error("Couldn't reach your VICIdial from the internet. It worked on localhost because that PC was on the same network / an allowed IP; live Modo runs on Vercel, whose IP your dialer likely blocks. Make the dialer address public and, in VICIdial, allow API access from any IP.");
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
async function apiFetch(base, relPath, params, proxy) {
  const disp = await proxyDispatcher(proxy);
  let last;
  for (const c of apiCandidates(base, relPath)) {
    const url = new URL(c);
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    const r = await vfetch(url, 12000, disp); const text = (await r.text()).trim();
    last = { r, text, tried: c };
    // A real API hit: not a 404 and not an HTML page (an "ERROR: ..." body is still a valid hit).
    if (r.status !== 404 && !/^\s*<(!doctype|html)/i.test(text)) return last;
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
  const { r, text, tried } = await apiFetch(base, "vicidial/non_agent_api.php", params, cfg.proxy);
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
  const { text } = await apiFetch(base, "vicidial/non_agent_api.php", { source: "crmmodo", user, pass, function: fn, ...params }, cfg.proxy);
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
  const { text } = await apiFetch(base, "agc/api.php", p, cfg.proxy);
  if (/^ERROR/i.test(text)) throw new Error(text.replace(/^ERROR:\s*/i, "VICIdial: "));
  return text;
}

// Everything VICIdial knows about a lead (name, address…). Best effort: older VICIdials may not have this function.
export async function leadInfo(leadId) {
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
