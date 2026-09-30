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
  // ── Chat & alerts (get CRM events pushed anywhere) ──
  slack: { label: "Slack", hint: "Incoming webhook URL from api.slack.com/messaging/webhooks", fields: ["url"], events: true, group: "Chat & alerts" },
  discord: { label: "Discord", hint: "Channel settings → Integrations → Webhooks → copy URL", fields: ["url"], events: true, group: "Chat & alerts" },
  teams: { label: "Microsoft Teams", hint: "Channel → ⋯ → Connectors → Incoming Webhook → copy URL", fields: ["url"], events: true, group: "Chat & alerts" },
  googlechat: { label: "Google Chat", hint: "Space → Apps & integrations → Webhooks → Add webhook → copy URL", fields: ["url"], events: true, group: "Chat & alerts" },
  mattermost: { label: "Mattermost", hint: "Integrations → Incoming Webhooks → copy URL", fields: ["url"], events: true, group: "Chat & alerts" },
  rocketchat: { label: "Rocket.Chat", hint: "Admin → Integrations → Incoming → copy the Webhook URL", fields: ["url"], events: true, group: "Chat & alerts" },
  // ── Phone push & SMS (land on a phone, even locked) ──
  telegram: { label: "Telegram", hint: "Free phone alerts. Bot token from @BotFather + your chat ID (get it from @userinfobot)", fields: ["token", "chatId"], events: true, group: "Phone & SMS" },
  ntfy: { label: "ntfy (free phone push)", hint: "Install the ntfy app, pick a topic, then put its URL here e.g. https://ntfy.sh/modo-alerts-8412", fields: ["url"], events: true, group: "Phone & SMS" },
  pushover: { label: "Pushover", hint: "App token + your user key from pushover.net — instant push to your phone", fields: ["token", "userKey"], events: true, group: "Phone & SMS" },
  twilio: { label: "Twilio SMS", hint: "Text alerts to a phone. Account SID + Auth Token + a Twilio 'from' number + your 'to' number", fields: ["sid", "token", "from", "to"], events: true, group: "Phone & SMS" },
  whatsapp: { label: "WhatsApp (Meta Cloud API)", hint: "Phone-number ID + a permanent token from Meta; sends to your 'to' number using a template", fields: ["phoneId", "token", "to", "template"], events: true, group: "Phone & SMS" },
  sms: { label: "SMS gateway (generic)", hint: "Any SMS API that accepts a JSON POST of { to, text }", fields: ["url", "to", "secret"], events: true, group: "Phone & SMS" },
  // ── Automation & data ──
  sheets: { label: "Google Sheets", hint: "Apps Script web-app URL that appends each event as a row", fields: ["url"], events: true, group: "Automation & data" },
  webhook: { label: "Webhook (Zapier, Make, n8n, your own)", hint: "Any URL that accepts a JSON POST", fields: ["url", "secret"], events: true, group: "Automation & data" },
  lookup: { label: "Lookup API", hint: "Add any lookup (carrier, utility provider, credit, address…). URL with {q} for the search and {key} for your key", fields: ["url", "apiKey", "header", "hint"], group: "Automation & data" },
  // ── Core services ──
  ai: { label: "AI provider", hint: "Groq/Gemini/OpenAI/Anthropic/OpenRouter/DeepSeek/Mistral/xAI/Together or local Ollama", fields: ["provider", "apiKey", "model", "baseUrl"], group: "Core services" },
  vicidial: { label: "VICIdial", hint: "Non-Agent API user (level 7+, View Reports on). Monitor phone = your VICIdial phone login, used for listening in", fields: ["url", "user", "pass", "campaigns", "userGroups", "monitorPhone", "serverIp", "agentUrl", "dispositions", "pauseCodes", "proxy"], group: "Core services" },
  smtp: { label: "Email (SMTP)", hint: "Send emails to customers, e.g. Gmail (smtp.gmail.com, port 465, app password) or your host's SMTP", fields: ["host", "port", "secure", "user", "pass", "fromName", "fromEmail"], group: "Core services" },
  turn: { label: "TURN server (calls)", hint: "Helps huddles connect on strict networks, e.g. metered.ca free tier", fields: ["url", "user", "pass"], group: "Core services" },
};
// Connector types that receive CRM events (Slack-style push). Everything here goes through deliver().
export const NOTIFY_TYPES = ["slack", "discord", "teams", "googlechat", "mattermost", "rocketchat", "telegram", "ntfy", "pushover", "twilio", "whatsapp", "sms", "sheets", "webhook"];
const SECRET = ["secret", "apiKey", "pass", "token", "userKey"];

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

function textFor(event, data) {
  const title = EVENTS[event] || event;
  const lines = Object.entries(data || {}).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}: ${v}`);
  const body = lines.join("\n");
  return { title, body, full: body ? `${title}\n${body}` : title };
}
function format(type, event, data) {
  // Generic JSON payload for Sheets / webhooks (and the format the text-only channels wrap)
  return { event, title: EVENTS[event] || event, at: new Date().toISOString(), data };
}

// Turn one event into an actual HTTP send tailored to the connector. Never throws.
async function deliver(c, event, data) {
  const cfg = parse(c);
  const t = textFor(event, data);
  const b64 = (s) => Buffer.from(s).toString("base64");
  try {
    let url, body, headers = { "content-type": "application/json" };
    switch (c.type) {
      case "slack": case "mattermost": case "rocketchat":
        if (!cfg.url) return "No URL set"; url = cfg.url; body = JSON.stringify({ text: `*${t.title}*\n${t.body}` }); break;
      case "discord":
        if (!cfg.url) return "No URL set"; url = cfg.url; body = JSON.stringify({ content: `**${t.title}**\n${t.body}`.slice(0, 1900) }); break;
      case "teams":
        if (!cfg.url) return "No URL set"; url = cfg.url; body = JSON.stringify({ text: `**${t.title}**\n\n${t.body.replace(/\n/g, "  \n")}` }); break;
      case "googlechat":
        if (!cfg.url) return "No URL set"; url = cfg.url; body = JSON.stringify({ text: `*${t.title}*\n${t.body}` }); break;
      case "telegram":
        if (!cfg.token || !cfg.chatId) return "Add the bot token and chat ID";
        url = `https://api.telegram.org/bot${cfg.token}/sendMessage`;
        body = JSON.stringify({ chat_id: cfg.chatId, text: `<b>${t.title}</b>\n${t.body}`, parse_mode: "HTML", disable_web_page_preview: true }); break;
      case "ntfy":
        if (!cfg.url) return "No topic URL set"; url = cfg.url;
        headers = { "content-type": "text/plain", Title: t.title, Priority: "high" }; body = t.body || t.title; break;
      case "pushover":
        if (!cfg.token || !cfg.userKey) return "Add the app token and user key";
        url = "https://api.pushover.net/1/messages.json"; headers = { "content-type": "application/x-www-form-urlencoded" };
        body = new URLSearchParams({ token: cfg.token, user: cfg.userKey, title: t.title, message: (t.body || t.title).slice(0, 1000), priority: "1" }).toString(); break;
      case "twilio":
        if (!cfg.sid || !cfg.token || !cfg.from || !cfg.to) return "Add SID, token, from and to numbers";
        url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`;
        headers = { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + b64(`${cfg.sid}:${cfg.token}`) };
        body = new URLSearchParams({ From: cfg.from, To: cfg.to, Body: t.full.slice(0, 1500) }).toString(); break;
      case "whatsapp":
        if (!cfg.phoneId || !cfg.token || !cfg.to) return "Add phone-number ID, token and to number";
        url = `https://graph.facebook.com/v20.0/${cfg.phoneId}/messages`;
        headers = { "content-type": "application/json", authorization: `Bearer ${cfg.token}` };
        body = JSON.stringify({ messaging_product: "whatsapp", to: cfg.to, type: "text", text: { body: t.full.slice(0, 4000) } }); break;
      case "sms":
        if (!cfg.url) return "No URL set"; url = cfg.url; if (cfg.secret) headers["x-modo-secret"] = cfg.secret;
        body = JSON.stringify({ to: cfg.to || "", text: t.full, event }); break;
      case "sheets": case "webhook": default:
        if (!cfg.url) return "No URL set"; url = cfg.url; if (cfg.secret) headers["x-modo-secret"] = cfg.secret;
        body = JSON.stringify(format(c.type, event, data)); break;
    }
    const r = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
    if (!r.ok) { const detail = (await r.text().catch(() => "")).slice(0, 120); return `HTTP ${r.status}${detail ? " — " + detail : ""}`; }
    return "OK";
  } catch (e) { return "Failed: " + (e.message || e); }
}

// Fire an event to every enabled connector subscribed to it. Never throws.
export async function emit(event, data) {
  try {
    const list = await db.connector.findMany({ where: { enabled: true, type: { in: NOTIFY_TYPES } } });
    await Promise.all(list.filter((c) => c.events.split(",").includes(event)).map(async (c) => {
      const status = await deliver(c, event, data);
      await db.connector.update({ where: { id: c.id }, data: { lastStatus: `${event}: ${status}`, lastAt: new Date() } }).catch(() => {});
    }));
  } catch {}
}

export async function test(c) {
  if (NOTIFY_TYPES.includes(c.type)) return deliver(c, "test", { message: "CRM Modo connector test", time: new Date().toLocaleString() });
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
