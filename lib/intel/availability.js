// Service availability at the customer's address: electric utility (federal HIFLD territory maps),
// residential power rate (NREL/OpenEI, free key), home-internet picture (Census broadband share, wireline
// footprints, and — on Deep scan — a live AI web search of providers at that address), plus one-tap
// links to every big provider's own availability checker.
import { getJSON, source, DAY } from "./http";
import { askWebJSON } from "./aiweb";

// Electric retail service territories. Two public mirrors of the same federal (HIFLD) dataset.
const TERRITORY_LAYERS = [
  "https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/energy/FeatureServer/26",
  "https://eedgis.pnnl.gov/arcgis/rest/services/Hosted/Electric_Service_Territories/FeatureServer/0",
];
const pick = (o, ...keys) => { for (const k of keys) for (const kk of Object.keys(o || {})) if (kk.toLowerCase() === k) return o[kk]; return null; };
async function electric(geo) {
  for (const base of TERRITORY_LAYERS) {
    const qs = new URLSearchParams({ geometry: `${geo.lng},${geo.lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", f: "json" });
    const r = await getJSON(`${base}/query?${qs}`, { ttl: 90 * DAY, timeout: 14000 }).catch(() => null);
    const feats = r?.json?.features;
    if (!Array.isArray(feats) || !feats.length) continue;
    return feats.slice(0, 3).map((f) => {
      const a = f.attributes || {};
      return { name: pick(a, "name", "utility_name", "utility"), type: pick(a, "type", "ownership"), phone: pick(a, "telephone", "phone"), web: pick(a, "website", "web"), customers: Number(pick(a, "customers")) || null };
    }).filter((u) => u.name);
  }
  return null;
}
async function rates(geo, key) {
  if (!key) return null;
  const r = await getJSON(`https://developer.nrel.gov/api/utility_rates/v3.json?api_key=${encodeURIComponent(key)}&lat=${geo.lat}&lon=${geo.lng}`, { ttl: 30 * DAY });
  const o = r.json?.outputs; if (!r.ok || !o) throw new Error(r.json?.errors?.[0] || `NREL ${r.status}`);
  const n = (x) => (typeof x === "number" && x > 0 ? x : null);
  return { utility: o.utility_name || null, residential: n(o.residential), commercial: n(o.commercial) };
}

// Wireline footprints we're confident about (state level). Always "confirm at the address".
const ATT_WIRELINE = "AL AR CA FL GA IL IN KS KY LA MI MS MO NV NC OH OK SC TN TX WI".split(" ");
const FIOS = "NY NJ PA MA RI MD VA DE DC".split(" ");
const CHECKERS = [
  ["Verizon Home Internet / Fios", "https://www.verizon.com/home/internet/"],
  ["AT&T Fiber & Internet Air", "https://www.att.com/internet/"],
  ["T-Mobile Home Internet", "https://www.t-mobile.com/home-internet"],
  ["Xfinity", "https://www.xfinity.com/learn/internet-service"],
  ["Spectrum", "https://www.spectrum.com/internet"],
  ["Starlink", "https://www.starlink.com/"],
  ["FCC National Broadband Map (every provider)", "https://broadbandmap.fcc.gov/home"],
];

export async function availabilityIntel(geo, acsData, cfgs, { deep } = {}) {
  if (!geo) return { error: "Needs an address or ZIP first." };
  const [sEl, sRate, sAi] = await Promise.all([
    source("HIFLD electric territories", () => electric(geo)),
    cfgs.nrel?.apiKey ? source("NREL / OpenEI utility rates", () => rates(geo, cfgs.nrel.apiKey)) : Promise.resolve(null),
    deep ? source("AI web search (providers)", () => providersByAI(geo)) : Promise.resolve(null),
  ]);
  const facts = [], badges = [];
  const el = sEl?.data || [];
  if (el.length) {
    el.forEach((u, i) => facts.push([i ? "Also serving the area" : "Electric utility", [u.name, u.type && `(${String(u.type).toLowerCase()})`].filter(Boolean).join(" "), i ? null : "ok"]));
    if (el[0].phone) facts.push(["Utility phone", el[0].phone]);
    if (el[0].customers) facts.push(["Utility size", `${el[0].customers.toLocaleString("en-US")} customers`]);
    badges.push({ text: `Power: ${el[0].name}`, tone: "info" });
  } else facts.push(["Electric utility", "Territory map didn't answer — try again", "muted"]);
  const rt = sRate?.data;
  if (rt?.residential) {
    facts.push(["Residential power rate", `$${rt.residential.toFixed(3)}/kWh${rt.utility ? " · " + rt.utility : ""}`]);
    facts.push(["≈ Bill at 900 kWh/mo", `$${Math.round(rt.residential * 900)}`]);
  } else if (!cfgs.nrel?.apiKey) facts.push(["Power rate", "Add a free NREL key in Connectors → Customer intel to see $/kWh", "muted"]);
  const bb = acsData?.broadbandPct;
  if (bb != null) facts.push(["Homes with broadband (tract)", `${bb}%${bb < 70 ? " — low: good chance they're underserved" : ""}`, bb < 70 ? "warn" : null]);
  const st = geo.state;
  const wire = [];
  if (FIOS.includes(st)) wire.push("Verizon Fios");
  if (ATT_WIRELINE.includes(st)) wire.push("AT&T Fiber / Internet");
  wire.push("T-Mobile & Verizon 5G Home (address-based)", "Starlink");
  facts.push(["Likely in this state", wire.join(" · ")]);
  const ai = sAi?.data;
  return {
    facts, badges, utilities: el, providers: ai?.providers || null, providersNote: ai ? `Live AI web search · ${ai.source || "web"} — confirm at the address before quoting` : null,
    links: CHECKERS.map(([label, href]) => ({ label, href })),
    sources: [sEl, sRate, sAi].filter(Boolean).map(({ name, ok, ms, note }) => ({ name, ok, ms, note })),
    note: deep ? null : "Turn on Deep scan to search the live web for every internet provider at this address.",
  };
}

async function providersByAI(geo) {
  const where = geo.exact ? geo.matched : `ZIP ${geo.zip} (${geo.city}, ${geo.state})`;
  const d = await askWebJSON(`Which home internet providers serve ${where} in the United States right now? Use BroadbandNow, the FCC broadband map, or the providers' own sites.
Reply with JSON only: {"providers":[{"name":"","type":"Fiber|Cable|5G|DSL|Satellite|Fixed wireless","maxDown":"e.g. 2 Gbps","from":"cheapest monthly price like $50/mo or null"}],"source":"main site you used"}. Up to 8 providers, best first.`);
  if (!d?.providers?.length) return null;
  return { providers: d.providers.slice(0, 8).map((p) => ({ name: String(p.name || "").slice(0, 60), type: String(p.type || "").slice(0, 30), maxDown: String(p.maxDown || "").slice(0, 30), from: p.from ? String(p.from).slice(0, 30) : null })).filter((p) => p.name), source: d.source ? String(d.source).slice(0, 60) : null };
}
