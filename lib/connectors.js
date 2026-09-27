import { db } from "./db";
import { enc, dec } from "./crypto";

export const EVENTS = {
  "sale.created": "New sale submitted",
  "sale.status": "Sale verified or rejected",
  "attendance.late": "Agent signed in late",
  "huddle.started": "Huddle or call started",
  "agent.created": "New agent added",
};

export const TYPES = {
  slack: { label: "Slack", hint: "Incoming webhook URL from api.slack.com/messaging/webhooks", fields: ["url"], events: true },
  discord: { label: "Discord", hint: "Channel settings → Integrations → Webhooks → copy URL", fields: ["url"], events: true },
  sheets: { label: "Google Sheets", hint: "Apps Script web-app URL that appends each event as a row", fields: ["url"], events: true },
  webhook: { label: "Webhook (Zapier, Make, n8n, your own)", hint: "Any URL that accepts a JSON POST", fields: ["url", "secret"], events: true },
  ai: { label: "AI provider", hint: "Groq (free, very fast: console.groq.com), Gemini (free: aistudio.google.com) or Anthropic", fields: ["provider", "apiKey", "model"] },
  vicidial: { label: "VICIdial", hint: "Non-Agent API user (level 7+, View Reports on). Monitor phone = your VICIdial phone login, used for listening in", fields: ["url", "user", "pass", "monitorPhone", "serverIp", "agentUrl", "dispositions", "pauseCodes"] },
  lookup: { label: "Lookup API", hint: "Add any lookup (carrier, utility provider, credit, address…). URL with {q} for the search and {key} for your key", fields: ["url", "apiKey", "header", "hint"] },
  smtp: { label: "Email (SMTP)", hint: "Send emails to customers, e.g. Gmail (smtp.gmail.com, port 465, app password) or your host's SMTP", fields: ["host", "port", "secure", "user", "pass", "fromName", "fromEmail"] },
  turn: { label: "TURN server (calls)", hint: "Helps huddles connect on strict networks, e.g. metered.ca free tier", fields: ["url", "user", "pass"] },
};
const SECRET = ["secret", "apiKey", "pass"];

export const parse = (c) => { try { return JSON.parse(dec(c.config) || "{}"); } catch { return {}; } };
export const seal = (cfg) => enc(JSON.stringify(cfg)); // connector settings are stored encrypted
export function publicView(c) {
  const cfg = parse(c);
  for (const k of SECRET) if (cfg[k]) cfg[k] = "••••" + String(cfg[k]).slice(-4);
  return { ...c, config: cfg, events: c.events ? c.events.split(",").filter(Boolean) : [] };
}

// First enabled connector of a type (used for ai / vicidial / turn); falls back to .env in callers.
export async function configFor(type) {
  try {
    const c = await db.connector.findFirst({ where: { type, enabled: true }, orderBy: { createdAt: "desc" } });
    return c ? parse(c) : null;
  } catch { return null; }
}

function format(type, event, data) {
  const title = EVENTS[event] || event;
  const lines = Object.entries(data || {}).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}: ${v}`);
  if (type === "slack") return { text: `*${title}*\n${lines.join("\n")}` };
  if (type === "discord") return { content: `**${title}**\n${lines.join("\n")}`.slice(0, 1900) };
  return { event, title, at: new Date().toISOString(), data };
}

async function deliver(c, event, data) {
  const cfg = parse(c);
  if (!cfg.url) return "No URL set";
  try {
    const headers = { "content-type": "application/json" };
    if (cfg.secret) headers["x-modo-secret"] = cfg.secret;
    const r = await fetch(cfg.url, { method: "POST", headers, body: JSON.stringify(format(c.type, event, data)), signal: AbortSignal.timeout(6000) });
    return r.ok ? "OK" : `HTTP ${r.status}`;
  } catch (e) { return "Failed: " + (e.message || e); }
}

// Fire an event to every enabled connector subscribed to it. Never throws.
export async function emit(event, data) {
  try {
    const list = await db.connector.findMany({ where: { enabled: true, type: { in: ["slack", "discord", "sheets", "webhook"] } } });
    await Promise.all(list.filter((c) => c.events.split(",").includes(event)).map(async (c) => {
      const status = await deliver(c, event, data);
      await db.connector.update({ where: { id: c.id }, data: { lastStatus: `${event}: ${status}`, lastAt: new Date() } }).catch(() => {});
    }));
  } catch {}
}

export async function test(c) {
  if (["slack", "discord", "sheets", "webhook"].includes(c.type)) return deliver(c, "test", { message: "CRM Modo connector test", time: new Date().toLocaleString() });
  const cfg = parse(c);
  if (c.type === "ai") {
    try {
      const mod = await import("./ai");
      const t = await mod.askAI("Reply with the single word: connected", "Test", { override: cfg });
      const used = mod.lastModel;
      if ((cfg.provider || "groq") === "groq" && used && used !== cfg.model) {
        // Save the working model so the "does not exist" error never comes back
        const { db } = await import("./db");
        await db.connector.update({ where: { id: c.id }, data: { config: seal({ ...cfg, model: used }) } });
        return `OK: connected. "${cfg.model || "default"}" isn't available on Groq any more, so it now uses ${used}.`;
      }
      return "OK: " + t.slice(0, 40) + (used ? ` (${used})` : "");
    } catch (e) { return "Failed: " + e.message; }
  }
  if (c.type === "vicidial") {
    const { loggedInAgents } = await import("./vicidial");
    try { const a = await loggedInAgents(cfg); return `OK: ${a.length} agents logged in`; } catch (e) { return "Failed: " + e.message; }
  }
  if (c.type === "lookup") return cfg.url ? "Saved. Try it on the Lookups page." : "No URL set";
  if (c.type === "turn") return cfg.url ? "Saved (tested when a call connects)" : "No URL set";
  if (c.type === "smtp") { const { verifySmtp } = await import("./mailer"); try { await verifySmtp(cfg); return "OK: SMTP login works"; } catch (e) { return "Failed: " + e.message; } }
  return "Nothing to test";
}
