// WhatsApp helpers shared by the bots, the customer inbox and alerts. Two ways to connect:
//  1. Linked number (like WhatsApp Web, scan a QR in Modo → WhatsApp) — runs in the Modo Cloud Relay. Preferred.
//  2. Meta Cloud API connector (Connectors → WhatsApp) — the official way, used if no number is linked.
import { configFor } from "./connectors";
import { linked, sendLinked, getSettings as linkSettings } from "./walink";

export const digits = (n) => String(n || "").replace(/\D/g, "");
export async function waConfig() { const c = (await configFor("whatsapp")) || {}; return c.phoneId && c.token ? c : null; }

// Admin numbers allowed to command Modo from WhatsApp (and that receive alerts): "admins" field, else "to".
export function adminNumbers(cfg) {
  return String((cfg && (cfg.admins || cfg.to)) || "").split(/[\s,;]+/).map(digits).filter((x) => x.length >= 8);
}
export const isAdminNumber = (cfg, from) => adminNumbers(cfg).includes(digits(from));
export const aiReplyOn = (cfg) => !/^(off|no|false|0)$/i.test(String(cfg?.aiReply ?? "on").trim());

// Send a text. Outside WhatsApp's 24-hour window Meta only allows approved templates: then we send the
// template (default hello_world) so the person gets pinged and can reply, which reopens the window.
export async function sendWA(to, text, cfg) {
  if (!cfg && (await linked())) return sendLinked(to, text);
  cfg = cfg || (await waConfig()); if (!cfg) return { ok: false, error: "WhatsApp isn't connected. Link a number in Setup → WhatsApp." };
  const url = `https://graph.facebook.com/v20.0/${cfg.phoneId}/messages`;
  const headers = { "content-type": "application/json", authorization: `Bearer ${cfg.token}` };
  const post = (body) => fetch(url, { method: "POST", headers, body: JSON.stringify({ messaging_product: "whatsapp", to: digits(to), ...body }), signal: AbortSignal.timeout(12000) })
    .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) })).catch((e) => ({ ok: false, d: { error: { message: e.message } } }));
  const r = await post({ type: "text", text: { body: String(text || "").slice(0, 4000), preview_url: true } });
  if (r.ok) return { ok: true };
  const code = r.d?.error?.code, msg = r.d?.error?.message || "WhatsApp send failed";
  if (code === 131047 || /24 hours|re-engage/i.test(msg)) {
    const t = await post({ type: "template", template: { name: cfg.template || "hello_world", language: { code: cfg.template ? "en" : "en_US" } } });
    return { ok: false, window: true, pinged: t.ok, error: "Outside WhatsApp's 24-hour window — they need to message you first." };
  }
  return { ok: false, error: msg };
}

// Admin numbers and AI auto-reply: from Modo → WhatsApp when a number is linked, else from the Meta connector.
export async function waAdmins() {
  const ls = await linkSettings().catch(() => ({}));
  const own = String(ls.admins || "").split(/[\s,;]+/).map(digits).filter((x) => x.length >= 8);
  return own.length ? own : adminNumbers(await waConfig());
}
export async function waAiReply() {
  if (await linked()) return aiReplyOn(await linkSettings());
  return aiReplyOn(await waConfig());
}

export async function alertAdminsWA(text) {
  const nums = await waAdmins(); if (!nums.length) return;
  await Promise.all(nums.map((n) => sendWA(n, text).catch(() => {})));
}
