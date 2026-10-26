// Phone intel: number checks (built-in), safe-to-call hours, and carrier / line type from any free
// phone API the admin connected (Veriphone, NumVerify, Abstract). First one that answers wins.
import { getJSON, source, usTen, fmtPhone, DAY } from "./http";
import { areaInfo, tzFor, STATE_NAMES } from "../usdata";
import { callWindow } from "./rules";

const TOLLFREE = ["800", "833", "844", "855", "866", "877", "888"];
const PREMIUM = ["900", "976"];

function lineKind(t) {
  const x = String(t || "").toLowerCase();
  if (!x) return null;
  if (x.includes("voip") || x.includes("non_fixed") || x.includes("non-fixed")) return "VoIP";
  if (x.includes("mobile") || x.includes("cell") || x.includes("wireless")) return "Mobile";
  if (x.includes("landline") || x.includes("fixed")) return "Landline";
  if (x.includes("toll")) return "Toll-free";
  return t;
}

const PROVIDERS = {
  veriphone: async (cfg, d) => {
    const r = await getJSON(`https://api.veriphone.io/v2/verify?phone=%2B1${d}&key=${encodeURIComponent(cfg.apiKey)}`, { ttl: 7 * DAY });
    const j = r.json; if (!r.ok || !j || j.status !== "success") throw new Error(j?.message || `Veriphone ${r.status}`);
    return { valid: j.phone_valid, carrier: j.carrier || null, line: lineKind(j.phone_type), region: j.phone_region || null };
  },
  numverify: async (cfg, d) => {
    // NumVerify's free plan is http only.
    const r = await getJSON(`http://apilayer.net/api/validate?access_key=${encodeURIComponent(cfg.apiKey)}&number=1${d}&country_code=US&format=1`, { ttl: 7 * DAY });
    const j = r.json; if (!r.ok || !j || j.error) throw new Error(j?.error?.info || `NumVerify ${r.status}`);
    return { valid: j.valid, carrier: j.carrier || null, line: lineKind(j.line_type), region: j.location || null };
  },
  abstractphone: async (cfg, d) => {
    const r = await getJSON(`https://phonevalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(cfg.apiKey)}&phone=1${d}`, { ttl: 7 * DAY });
    const j = r.json; if (!r.ok || !j || j.error) throw new Error(j?.error?.message || `Abstract ${r.status}`);
    return { valid: j.valid, carrier: j.carrier || null, line: lineKind(j.type), region: j.location || null };
  },
};
export const PHONE_PROVIDERS = Object.keys(PROVIDERS);

export async function phoneIntel(input, cfgs) {
  const d = usTen(input);
  if (!d) return { error: "Needs a 10-digit US number." };
  const ac = d.slice(0, 3), ex = d.slice(3, 6);
  const formatOk = /^[2-9]\d\d$/.test(ac) && /^[2-9]\d\d$/.test(ex) && ex !== "555";
  const info = areaInfo(ac);
  const st = info?.state || null;
  const tz = st ? tzFor(st) : null;
  const win = st && tz ? callWindow(st, tz.iana) : null;
  const facts = [
    ["Number", `+1 ${fmtPhone(d)}`],
    ["Valid US format", formatOk ? "Yes" : "No — area code/exchange can't start with 0 or 1 (or 555 test number)", formatOk ? "ok" : "bad"],
    ["Area code", TOLLFREE.includes(ac) ? `${ac} · toll-free` : PREMIUM.includes(ac) ? `${ac} · premium-rate ⚠` : info ? `${ac} · ${info.stateName}` : `${ac} · unknown / new`],
    ["Time zone", tz ? `${tz.zone}${tz.note ? " · " + tz.note : ""}` : "—"],
  ];
  const badges = [];
  // carrier lookups — try each connected provider in turn
  const tried = [];
  let carrier = null;
  for (const name of PHONE_PROVIDERS) {
    if (!cfgs[name]?.apiKey) continue;
    const s = await source(name, () => PROVIDERS[name](cfgs[name], d));
    tried.push({ name, ok: s.ok, ms: s.ms, note: s.note });
    if (s.ok) { carrier = s.data; break; }
  }
  if (carrier) {
    facts.push(["Carrier", carrier.carrier || "Not reported"]);
    facts.push(["Line type", carrier.line || "Not reported", carrier.line === "VoIP" ? "warn" : carrier.line === "Mobile" ? "ok" : null]);
    if (carrier.region) facts.push(["Registered to", carrier.region]);
    if (carrier.valid === false) badges.push({ text: "Carrier says not in service", tone: "bad" });
    if (carrier.line === "VoIP") badges.push({ text: "VoIP number", tone: "warn" });
    if (carrier.line === "Mobile") badges.push({ text: "Mobile — can text", tone: "ok" });
    if (carrier.line === "Landline") badges.push({ text: "Landline — no texts", tone: "info" });
  } else {
    facts.push(["Carrier / line type", tried.length ? "Phone API didn't answer" : "Add a free phone API in Connectors → Customer intel (Veriphone: 1,000 free/month)", "muted"]);
  }
  if (win) {
    facts.push(["Their time now", win.local]);
    facts.push(["Safe to call now?", win.allowed ? `Yes — ${win.note}` : `No — ${win.note}`, win.allowed ? "ok" : "bad"]);
    facts.push(["Allowed hours (" + st + ")", `Mon–Fri ${win.weekdays} · Sat ${win.saturday} · Sun ${win.sunday}${win.holidays === "no calls" ? " · no calls on holidays" : ""}`]);
    badges.push(win.allowed ? { text: "OK to call now", tone: "ok" } : { text: "Don't call now", tone: "bad" });
    if (win.stricter) badges.push({ text: `${STATE_NAMES[st]} has stricter call hours`, tone: "warn" });
  }
  if (!formatOk) badges.push({ text: "Invalid number", tone: "bad" });
  return {
    facts, badges, state: st, carrier, callable: win?.allowed ?? null, formatOk,
    links: [
      { label: "Search this number on the web", href: `https://www.google.com/search?q=%22${encodeURIComponent(fmtPhone(d))}%22` },
      { label: "National Do Not Call Registry — sellers' access", href: "https://telemarketing.donotcall.gov/" },
    ],
    sources: [{ name: "Modo NANP data", ok: true, ms: 0 }, ...tried],
    note: "Area code shows where the number was issued — people keep numbers when they move. Call-hour rules: federal TCPA plus state law; not legal advice.",
  };
}
