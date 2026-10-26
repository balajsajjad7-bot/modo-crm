// Device intel: IMEI checksum, make/model from the IMEI's TAC (free Osmocom TAC database, cached in
// memory), live market value (Deep scan, via the AI web search already used by Sales), and quick links
// to the free lost/stolen checker and carrier unlock pages.
import { source } from "./http";
import { lookupDeviceValue } from "../deviceValue";

export function luhn(num) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) { let n = +num[num.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; }
  return sum % 10 === 0;
}

let tacdb = { at: 0, map: null, loading: null };
async function loadTac() {
  if (tacdb.map && Date.now() - tacdb.at < 7 * 864e5) return tacdb.map;
  if (tacdb.loading) return tacdb.loading;
  tacdb.loading = (async () => {
    const r = await fetch("https://tacdb.osmocom.org/export/tacdb.csv", { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`TAC database ${r.status}`);
    const text = await r.text(); const map = new Map();
    for (const line of text.split(/\r?\n/)) {
      const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
      if (/^\d{8}$/.test(cols[0])) map.set(cols[0], { brand: cols[1] || "", model: cols[2] || "" });
    }
    if (map.size < 100) throw new Error("TAC database came back empty");
    tacdb = { at: Date.now(), map, loading: null };
    return map;
  })().catch((e) => { tacdb.loading = null; throw e; });
  return tacdb.loading;
}

const UNLOCK = [
  ["Free lost/stolen check (CTIA)", "https://www.stolenphonechecker.org/spc/"],
  ["Verizon device unlock policy", "https://www.verizon.com/support/device-unlocking-policy/"],
  ["AT&T device unlock", "https://www.att.com/deviceunlock/"],
  ["T-Mobile unlock status", "https://www.t-mobile.com/responsibility/consumer-info/policies/sim-unlock-policy"],
];

export async function deviceIntel({ imei, device }, { deep } = {}) {
  const facts = [], badges = [], sources = [];
  const im = String(imei || "").replace(/\D/g, "");
  let model = null;
  if (im) {
    const ok = im.length === 15 && luhn(im);
    facts.push(["IMEI", im.length === 15 ? im.replace(/(\d{2})(\d{6})(\d{6})(\d)/, "$1 $2 $3 $4") : im]);
    facts.push(["IMEI checksum", im.length !== 15 ? `Needs 15 digits (has ${im.length})` : ok ? "Valid" : "Invalid — typo in the number", ok ? "ok" : "bad"]);
    badges.push(ok ? { text: "IMEI valid", tone: "ok" } : { text: "IMEI invalid", tone: "bad" });
    if (im.length >= 8) {
      const s = await source("Osmocom TAC database", async () => (await loadTac()).get(im.slice(0, 8)) || false);
      sources.push({ name: s.name, ok: s.ok, ms: s.ms, note: s.note });
      if (s.data) { model = `${s.data.brand} ${s.data.model}`.trim(); facts.push(["Make / model (from IMEI)", model, "ok"]); }
      else if (s.ok) facts.push(["Make / model (from IMEI)", "TAC not in the free database — new or rare model", "muted"]);
    }
  }
  const name = String(device || "").trim() || model;
  if (name) {
    facts.push(["Device on file", device || "—"]);
    if (model && device && !model.toLowerCase().split(" ").some((w) => w.length > 2 && device.toLowerCase().includes(w))) { facts.push(["IMEI vs device", `IMEI says ${model} — doesn't match the device on the sale`, "warn"]); badges.push({ text: "IMEI/device mismatch", tone: "warn" }); }
    if (deep) {
      const s = await source("Market value (AI web search)", () => lookupDeviceValue(name));
      sources.push({ name: s.name, ok: s.ok, ms: s.ms, note: s.note });
      if (s.data) {
        facts.push(["New price (US)", `$${Math.round(s.data.value).toLocaleString()}${s.data.live ? "" : " (estimate)"}`]);
        if (s.data.used) facts.push(["Used resale value", `$${Math.round(s.data.used).toLocaleString()}`]);
        facts.push(["Price source", [s.data.source, s.data.note].filter(Boolean).join(" · ")]);
      }
    }
  }
  if (!im && !name) return { error: "Add an IMEI or device name." };
  return { facts, badges, model, links: UNLOCK.map(([label, href]) => ({ label, href })), sources, note: deep || !name ? null : "Deep scan adds today's new and used market value." };
}
