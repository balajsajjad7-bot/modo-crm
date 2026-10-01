// Which dialer Modo drives, and how. Admin → Tools → Dialer setup changes all of this without code.
// provider: "vicidial" (built in) | "custom" (any dialer with an HTTP API) | "off"
import { getSettings } from "./settings";
import { db } from "./db";
import { enc, dec } from "./crypto";

export const ACTIONS = ["status", "dial", "hangup", "pause", "resume", "dispo", "park", "grab", "transfer", "dtmf", "record"];
export const DEFAULT_DISPOS = [["SALE", "Sale"], ["NI", "Not interested"], ["CALLBK", "Callback"], ["NA", "No answer"], ["A", "Answering machine"], ["B", "Busy"], ["DNC", "Do not call"], ["N", "Dead air"]].map(([code, label]) => ({ code, label }));
export const DEFAULT_PAUSE = [["BREAK", "Break"], ["LUNCH", "Lunch"], ["TRAIN", "Training"], ["MEET", "Meeting"]].map(([code, label]) => ({ code, label }));

export async function dialerConfig() {
  const s = await getSettings();
  let c = {}; try { c = JSON.parse(s.dialer || "{}"); } catch {}
  const custom = c.custom || {};
  return { provider: c.provider || "vicidial", agentsSeeDialer: c.agentsSeeDialer !== false, dispositions: c.dispositions?.length ? c.dispositions : null, pauseCodes: c.pauseCodes?.length ? c.pauseCodes : null,
    custom: { ...custom, key: custom.key ? dec(custom.key) : "" }, name: c.name || "" };
}
export async function saveDialerConfig(patch) {
  const s = await getSettings();
  let c = {}; try { c = JSON.parse(s.dialer || "{}"); } catch {}
  const next = { ...c, ...patch };
  if (patch.custom) { next.custom = { ...(c.custom || {}), ...patch.custom }; if (patch.custom.key && !String(patch.custom.key).startsWith("••••")) next.custom.key = enc(patch.custom.key); else next.custom.key = c.custom?.key || ""; }
  await db.setting.update({ where: { id: "global" }, data: { dialer: JSON.stringify(next) } });
  return next;
}

// ── "Other dialer": each action is a URL template. Placeholders: {agent} {number} {code} {label} {digits} {note} {key} {on} {type}
const fill = (t, v) => String(t || "").replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(v[k] ?? ""));
const pick = (o, path) => String(path || "").split(".").filter(Boolean).reduce((x, k) => (x == null ? x : x[k]), o);
export async function customCall(cfg, action, vars) {
  const t = cfg.custom?.[action];
  if (!t?.url) throw new Error(`The "${action}" action isn't set up for this dialer yet (Admin → Tools → Dialer setup).`);
  const v = { ...vars, key: cfg.custom.key || "" };
  const headers = { accept: "application/json", ...(cfg.custom.keyHeader && cfg.custom.key ? { [cfg.custom.keyHeader]: cfg.custom.key } : {}) };
  const method = (t.method || "GET").toUpperCase();
  const init = { method, headers, cache: "no-store", signal: AbortSignal.timeout(8000) };
  if (method !== "GET" && t.body) { headers["content-type"] = "application/json"; init.body = String(t.body).replace(/\{(\w+)\}/g, (_, k) => JSON.stringify(String(v[k] ?? "")).slice(1, -1)); }
  const r = await fetch(fill(t.url, v), init);
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(`Dialer answered ${r.status}: ${(json?.message || json?.error || text).toString().slice(0, 200)}`);
  return { text, json };
}
// Pause or resume a Modo agent's linked dialer session. Best-effort — never throws.
// Used by status changes (Away/Busy) and breaks so the dialer follows what the agent is doing.
export async function pauseAgentDialer(uid, pause, code = "BREAK") {
  try {
    const { db } = await import("./db");
    const u = await db.user.findUnique({ where: { id: uid }, select: { vicidialUser: true } });
    const vu = u?.vicidialUser;
    if (!vu) return null;
    const dc = await dialerConfig();
    if (dc.provider === "vicidial") {
      const { agentApi } = await import("./vicidial");
      await agentApi("external_pause", vu, { value: pause ? "PAUSE" : "RESUME" });
      if (pause) await agentApi("pause_code", vu, { value: code }).catch(() => {});
      return pause ? "paused" : "ready";
    } else if (dc.provider === "custom") {
      await customCall(dc, pause ? "pause" : "resume", { agent: vu, code }).catch(() => {});
      return pause ? "paused" : "ready";
    }
  } catch { /* dialer not reachable — ignore */ }
  return null;
}

export async function customStatus(cfg, agent) {
  const { json, text } = await customCall(cfg, "status", { agent });
  const m = cfg.custom.map || {};
  const o = json || {};
  return { loggedIn: pick(o, m.loggedIn || "loggedIn") !== false, status: String(pick(o, m.status || "status") || text || "").toUpperCase(), phone: String(pick(o, m.phone || "phone") || "").replace(/\D/g, "").slice(-10),
    name: pick(o, m.name || "name") || "", campaign: pick(o, m.campaign || "campaign") || "", callsToday: Number(pick(o, m.callsToday || "callsToday")) || 0,
    address: pick(o, m.address || "address") || "", zip: pick(o, m.zip || "zip") || "", email: pick(o, m.email || "email") || "", leadId: pick(o, m.leadId || "leadId") || "" };
}
