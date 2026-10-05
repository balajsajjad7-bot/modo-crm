import { configFor } from "./connectors";
import { apiFetch, proxyDispatcher, clearHold, holdState, portalOf, portalLogin, loggedInAgents } from "./vicidial";
import { db } from "./db";
import { relayOf, relayOnline } from "./relay";

// Connection check for Admin → Dialer setup: runs each step Modo needs and says exactly what is blocked.
const step = async (name, fn) => {
  const t = Date.now();
  try { const r = await fn(); return { name, ok: r.ok !== false, warn: !!r.warn, detail: r.detail || "", fix: r.fix || "", ms: Date.now() - t }; }
  catch (e) { return { name, ok: false, detail: e.message, fix: "", ms: Date.now() - t }; }
};

export async function viciHealth() {
  const cfg = (await configFor("vicidial")) || {};
  const base = cfg.url || process.env.VICIDIAL_URL, user = cfg.user || process.env.VICIDIAL_API_USER, pass = cfg.pass || process.env.VICIDIAL_API_PASS;
  const steps = [];
  const held = holdState();
  steps.push(await step("Connector filled in", async () => {
    if (!base || !user || !pass) return { ok: false, detail: `Missing: ${[!base && "URL", !user && "API user", !pass && "API password"].filter(Boolean).join(", ")}`, fix: "Admin → Connectors → VICIdial: dialer URL (e.g. https://voiceverve.dialerlab.com), API user and password." };
    return { detail: `${base} · user ${user}${cfg.proxy ? " · through proxy" : ""}` };
  }));
  if (!base || !user || !pass) return { steps, held };
  const disp = await proxyDispatcher(cfg.proxy);

  if (!relay) steps.push(await step("Modo's outgoing IP (what your dialer sees)", async () => {
    const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store", signal: AbortSignal.timeout(5000), ...(disp ? { dispatcher: disp } : {}) });
    const d = await r.json();
    return { warn: !cfg.proxy, detail: d.ip + (cfg.proxy ? " (fixed, from your proxy)" : " (Vercel: this changes between requests)"),
      fix: cfg.proxy ? "Whitelist this IP with your dialer host." : "Vercel has no fixed IP. If your dialer host (e.g. dialerlab) blocks unknown IPs, either ask them to allow API access from any IP, or add a fixed-IP proxy in Connectors → VICIdial → Proxy and whitelist that one IP." };
  }));

  const portal = portalOf(cfg);
  const relay = relayOf(cfg);
  steps.push(await step("Office relay (gets past the dialer's firewall)", async () => {
    if (relay) return { detail: `Online · last check-in ${Math.round((Date.now() - new Date(cfg.relayAt)) / 1000)}s ago · all dialer requests go through your office PC` };
    return { warn: true, detail: cfg.relayAt ? `Offline since ${new Date(cfg.relayAt).toLocaleString()}` : "Not set up", fix: "If the steps below time out, your dialer is blocking Modo's server. Download Modo Relay (Dialer setup → Office relay) and run it on a PC in the office." };
  }));

  if (!relay) steps.push(await step("Sign in on the dialer's firewall page", async () => {
    if (!portal) return { warn: true, detail: "No firewall page set (fine if your dialer doesn't use one)", fix: "If your host gives you an 'Access Server (Firewall)' page (e.g. https://host:446/login.php), put it in Dialer setup → Firewall page." };
    const t = await portalLogin(portal, cfg.proxy, true);
    return { detail: `${portal.url} · ${String(t).slice(0, 100)}` };
  }));

  if (!relay) steps.push(await step("Reach the dialer website", async () => {
    const r = await fetch(new URL("/vicidial/welcome.php", base), { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(7000), ...(disp ? { dispatcher: disp } : {}) });
    return { detail: `Answered HTTP ${r.status}` };
  }));

  steps.push(await step("Admin API login (non_agent_api)", async () => {
    const { text, tried } = await apiFetch(base, "vicidial/non_agent_api.php", { source: "crmmodo", user, pass, function: "version" }, cfg.proxy, { bypassHold: true, portal, relay });
    if (/^ERROR/i.test(text)) return { ok: false, detail: text.slice(0, 200), fix: "Use a VICIdial user with user level 8+, 'API access' = 1 and 'View Reports' = 1." };
    return { detail: `${text.split("\n")[0].slice(0, 120)} · ${tried}` };
  }));

  steps.push(await step("Read logged-in agents", async () => {
    const rows = await loggedInAgents();
    if (!rows.length) return { warn: true, detail: "VICIdial says nobody is logged into the agent screen right now (checked all campaigns and every linked login).", fix: "An agent counts as logged in only after signing into the VICIdial agent screen (…/agc/vicidial.php) with phone login + user + campaign — signing in on the :446 firewall page isn't enough. Also check the person is linked to the same VICIdial user under Agents." };
    const names = rows.slice(0, 8).map((r) => `${r.full_name || r.user || r.f0} (${r.user || r.f0}${r.status ? ", " + r.status : ""})`).join(", ");
    const outside = rows.some((r) => r._outsideFilter);
    return { warn: outside, detail: `${rows.length} logged in: ${names}`, fix: outside ? "These agents are outside the campaign / user-group filter in Connectors → VICIdial. Clear or fix that filter." : "" };
  }));

  steps.push(await step("Agent controls (agc/api.php: dial, pause, hang up)", async () => {
    const { text } = await apiFetch(base, "agc/api.php", { source: "crmmodo", user, pass, function: "version" }, cfg.proxy, { bypassHold: true, portal, relay });
    if (/^ERROR/i.test(text)) return { ok: false, detail: text.slice(0, 200), fix: "The API user needs 'Agent API Access' = 1 in VICIdial → Users." };
    return { detail: text.split("\n")[0].slice(0, 120) };
  }));

  steps.push(await step("Call recordings (today)", async () => {
    const { text } = await apiFetch(base, "vicidial/non_agent_api.php", { source: "crmmodo", user, pass, function: "recording_lookup", date: new Date().toISOString().slice(0, 10), stage: "pipe", header: "YES" }, cfg.proxy, { bypassHold: true, portal, relay });
    if (/NO RECORDINGS FOUND/i.test(text)) return { warn: true, detail: "Works — no recordings today yet", fix: "Turn on recording for the campaign (Campaigns → Recording = ALLCALLS)." };
    if (/^ERROR/i.test(text)) return { warn: true, detail: text.slice(0, 200), fix: "Optional: give the API user permission for recording_lookup to see recordings in Modo." };
    return { detail: `Works — ${Math.max(0, text.split("\n").filter(Boolean).length - 1)} recording(s) today` };
  }));

  steps.push(await step("Your team linked to dialer logins", async () => {
    const users = await db.user.findMany({ where: { role: { in: ["AGENT", "ADMIN"] }, active: true }, select: { name: true, role: true, vicidialUser: true } });
    const missing = users.filter((u) => !u.vicidialUser);
    return { warn: missing.length > 0, detail: `${users.length - missing.length} of ${users.length} linked${missing.length ? " · not linked: " + missing.slice(0, 6).map((u) => u.name).join(", ") + (missing.length > 6 ? "…" : "") : ""}`, fix: missing.length ? "Dialer setup → Agents: type each person's VICIdial user (admins too, to use the admin dialer)." : "" };
  }));

  if (steps.slice(3, 6).every((x) => x.ok)) clearHold();
  return { steps, held: holdState() };
}
