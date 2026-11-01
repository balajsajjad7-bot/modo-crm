// One-click wiring for the AI receptionist: the SignalWire connector's Test button points your SignalWire
// number(s) at Modo's call script and checks the script loads. Credentials come from the connector
// (space, projectId, apiToken) or from the SIGNALWIRE_SPACE / SIGNALWIRE_PROJECT_ID / SIGNALWIRE_API_TOKEN env vars.
import { randomBytes } from "node:crypto";
import { parseRoutes } from "./voiceAgent";

const last10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);

export function swCreds(cfg = {}) {
  let space = String(cfg.space || process.env.SIGNALWIRE_SPACE || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (space && !space.includes(".")) space += ".signalwire.com";
  return { space, projectId: String(cfg.projectId || process.env.SIGNALWIRE_PROJECT_ID || "").trim(), apiToken: String(cfg.apiToken || process.env.SIGNALWIRE_API_TOKEN || "").trim() };
}

async function sw(creds, path, init = {}) {
  const r = await fetch(`https://${creds.space}${path}`, {
    ...init,
    headers: { "content-type": "application/json", accept: "application/json", authorization: "Basic " + Buffer.from(`${creds.projectId}:${creds.apiToken}`).toString("base64"), ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(r.status === 401 ? "SignalWire rejected the Project ID / API token (401)" : `SignalWire HTTP ${r.status} ${text.slice(0, 120)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

// Returns a status line for the Connectors page. Never throws.
export async function wireSignalwire(c, cfg, { origin, save } = {}) {
  try {
    const creds = swCreds(cfg);
    if (!creds.space || !creds.projectId || !creds.apiToken) return "Add your SignalWire space (e.g. yourspace.signalwire.com), Project ID and API token, then test again.";
    const routes = parseRoutes(cfg.routes);
    if (!Object.keys(routes).length) return "Add at least one route, e.g. Customer Happiness = +13055550101; Outreach = sip:7001@yourpbx.com";

    let secret = cfg.secret;
    if (!secret) { secret = randomBytes(24).toString("hex"); await save({ ...cfg, secret }); } // made for you, kept encrypted

    const base = String(cfg.baseUrl || origin || process.env.MODO_URL || process.env.URL || "").replace(/\/+$/, "");
    if (!/^https:\/\//.test(base)) return "Couldn't tell Modo's public https address — set baseUrl, e.g. https://dapper-custard-f935ba.netlify.app";
    const scriptUrl = `${base}/api/voice?key=${encodeURIComponent(secret)}`;

    // 1) Modo's call script must load before any number is pointed at it.
    const own = await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null);
    if (own?.version !== "1.0.0") return `Modo's call script didn't load from ${base}/api/voice — ${own?.error || "check baseUrl"}`;

    // 2) Point the number(s) at it.
    const list = await sw(creds, "/api/relay/rest/phone_numbers?page_size=100");
    let nums = Array.isArray(list) ? list : list.data || [];
    if (cfg.number) nums = nums.filter((n) => last10(n.number || n.phone_number) === last10(cfg.number));
    if (!nums.length) return cfg.number ? `${cfg.number} isn't in this SignalWire space.` : "No phone numbers in this SignalWire space yet — buy one in SignalWire → Phone Numbers, then test again.";
    // Several numbers and none picked: don't take over numbers that may be used for something else.
    if (nums.length > 1 && !cfg.number) return `This space has ${nums.length} numbers (${nums.map((n) => n.number || n.phone_number).join(", ")}). Put the one for support calls in "number", then test again.`;

    const done = [], failed = [];
    for (const n of nums) {
      try {
        await sw(creds, `/api/relay/rest/phone_numbers/${n.id}`, { method: "PUT", body: JSON.stringify({ call_handler: "relay_script", call_relay_script_url: scriptUrl }) });
        done.push(n.number || n.phone_number);
      } catch (e) { failed.push(`${n.number || n.phone_number}: ${e.message}`); }
    }
    const depts = Object.keys(routes).join(", ");
    if (!done.length) return "Failed: " + failed.join("; ");
    return `OK: ${done.join(", ")} now answered by the AI receptionist → ${depts}` + (failed.length ? `. Not wired: ${failed.join("; ")}` : "");
  } catch (e) { return "Failed: " + (e.message || e); }
}
