// Customer 360: runs every connector pack in parallel and scores the result.
import { configFor } from "../connectors";
import { phoneIntel } from "./phone";
import { geocode, addressIntel, acs } from "./address";
import { availabilityIntel } from "./availability";
import { emailIntel } from "./email";
import { deviceIntel } from "./device";
import { historyIntel } from "./history";
import { STATE_NAMES } from "../usdata";

export const INTEL_TYPES = ["veriphone", "numverify", "abstractphone", "abstractemail", "nrel", "usps", "census"];
async function configs() {
  const out = {};
  await Promise.all(INTEL_TYPES.map(async (t) => { const c = await configFor(t); if (c) out[t] = c; }));
  return out;
}
const timed = async (fn) => { const t = Date.now(); try { const r = await fn(); return r ? { ...r, ms: Date.now() - t } : null; } catch (e) { return { error: String(e?.message || e).slice(0, 200), ms: Date.now() - t }; } };

export async function runIntel(input, session, { deep = false } = {}) {
  const cfgs = await configs();
  const t0 = Date.now();
  const has = { phone: !!input.phone, address: !!(input.address || input.zip), email: !!input.email, device: !!(input.imei || input.device) };
  // Address first (availability depends on it), everything else alongside it.
  const geoP = has.address ? geocode([input.address, input.zip && !String(input.address || "").includes(input.zip) ? input.zip : ""].filter(Boolean).join(" "), input.zip) : Promise.resolve(null);
  const addrP = geoP.then((g) => (g ? timed(() => addressIntel(g, cfgs)) : null));
  const availP = geoP.then(async (g) => {
    if (!g?.geo) return has.address ? { error: "Needs a findable address." } : null;
    const a = await acs(g.geo, cfgs.census?.apiKey).catch(() => null); // cached — address pack already asked
    return timed(() => availabilityIntel(g.geo, a, cfgs, { deep }));
  });
  const [phone, address, availability, email, device, history] = await Promise.all([
    has.phone ? timed(() => phoneIntel(input.phone, cfgs)) : null,
    addrP, availP,
    has.email ? timed(() => emailIntel(input.email, cfgs)) : null,
    has.device ? timed(() => deviceIntel(input, { deep })) : null,
    timed(() => historyIntel(input, session)),
  ]);
  const packs = { phone, address, availability, email, device, history };

  // Cross-checks between packs + an overall score.
  const flags = [];
  const addrState = address?.geo?.state, phoneState = phone?.state;
  if (addrState && phoneState && addrState !== phoneState) flags.push({ text: `Phone is from ${STATE_NAMES[phoneState] || phoneState}, address is in ${STATE_NAMES[addrState] || addrState}`, tone: "info" });
  for (const p of Object.values(packs)) for (const b of p?.badges || []) if (b.tone === "bad" || b.tone === "warn") flags.push(b);
  const pts = []; // [earned, possible]
  if (phone && !phone.error) pts.push([phone.formatOk ? (phone.carrier?.valid === false ? 2 : phone.carrier?.line === "VoIP" ? 7 : 10) : 0, 10]);
  if (address && !address.error) pts.push([address.geo?.exact ? 10 : 5, 10]);
  if (email && !email.error && email.deliverable !== null) pts.push([email.disposable ? 0 : email.deliverable ? 10 : 3, 10]);
  if (device && !device.error) pts.push([device.badges?.some((b) => b.tone === "bad") ? 2 : 10, 10]);
  const answered = Object.values(packs).flatMap((p) => p?.sources || []);
  const partial = answered.length > 2 && answered.filter((x) => x.ok).length / answered.length < 0.5;
  const score = pts.length >= 2 && !partial ? Math.round((pts.reduce((a, [x]) => a + x, 0) / pts.reduce((a, [, y]) => a + y, 0)) * 100) : null;
  const sources = Object.values(packs).flatMap((p) => p?.sources || []);
  return {
    at: new Date().toISOString(), ms: Date.now() - t0, deep, score,
    grade: score == null ? (partial ? "Partial" : null) : score >= 85 ? "Strong" : score >= 60 ? "Fair" : "Weak",
    callable: phone?.callable ?? null, flags: dedupe(flags).slice(0, 10), packs,
    connected: Object.fromEntries(INTEL_TYPES.map((t) => [t, !!cfgs[t]])),
    sourceCount: { ok: sources.filter((s) => s.ok).length, all: sources.length },
  };
}
function dedupe(list) { const s = new Set(); return list.filter((x) => (s.has(x.text) ? false : (s.add(x.text), true))); }
