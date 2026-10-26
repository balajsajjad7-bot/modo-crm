// Address intel: official US Census geocoding (verified address, county, census tract), neighborhood
// profile from the Census American Community Survey, live weather + National Weather Service alerts,
// nearest UPS & carrier stores (OpenStreetMap), and USPS deliverability when a free USPS key is connected.
import { getJSON, source, milesBetween, money, DAY, HOUR } from "./http";
import { tzFor, STATE_NAMES } from "../usdata";

const FIPS = { "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "72": "PR" };

// ── 1. Geocode ────────────────────────────────────────────────────────────────────────────────────
async function census(q) {
  const r = await getJSON(`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`, { ttl: 30 * DAY, timeout: 15000 });
  const m = r.json?.result?.addressMatches?.[0];
  if (!m) return null;
  const g = m.geographies || {};
  const tract = g["Census Tracts"]?.[0] || {};
  const county = g.Counties?.[0] || {};
  const c = m.addressComponents || {};
  return { source: "US Census", matched: m.matchedAddress, lat: m.coordinates.y, lng: m.coordinates.x, state: c.state || FIPS[tract.STATE || county.STATE], zip: c.zip, city: c.city,
    countyName: county.NAME, stateFips: tract.STATE || county.STATE, countyFips: tract.COUNTY || county.COUNTY, tractFips: tract.TRACT, tractName: tract.NAME, exact: true };
}
async function nominatim(q) {
  const r = await getJSON(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&countrycodes=us&limit=1`, { ttl: 30 * DAY });
  const m = Array.isArray(r.json) && r.json[0];
  if (!m) return null;
  const a = m.address || {};
  const iso = a["ISO3166-2-lvl4"] || ""; // US-TX
  return { source: "OpenStreetMap", matched: m.display_name, lat: +m.lat, lng: +m.lon, state: iso.startsWith("US-") ? iso.slice(3) : null, zip: a.postcode, city: a.city || a.town || a.village, countyName: a.county, exact: ["house", "building", "residential"].includes(m.addresstype) || !!a.house_number };
}
async function zipOnly(z) {
  const r = await getJSON(`https://api.zippopotam.us/us/${z}`, { ttl: 90 * DAY });
  const p = r.ok && r.json?.places?.[0]; if (!p) return null;
  return { source: "ZIP centre", matched: `${p["place name"]}, ${p["state abbreviation"]} ${z}`, lat: +p.latitude, lng: +p.longitude, state: p["state abbreviation"], zip: z, city: p["place name"], exact: false };
}
export async function geocode(address, zip) {
  const tried = [];
  const q = String(address || "").trim();
  if (q.length > 5) {
    for (const [name, fn] of [["US Census geocoder", census], ["OpenStreetMap", nominatim]]) {
      const s = await source(name, () => fn(q)); tried.push({ name, ok: s.ok, ms: s.ms, note: s.note });
      if (s.ok) return { geo: s.data, tried };
    }
  }
  const z = String(zip || q.match(/\b\d{5}\b/)?.[0] || "").slice(0, 5);
  if (/^\d{5}$/.test(z)) { const s = await source("ZIP lookup", () => zipOnly(z)); tried.push({ name: "ZIP lookup", ok: s.ok, ms: s.ms, note: s.note }); if (s.ok) return { geo: s.data, tried }; }
  return { geo: null, tried };
}

// ── 2. Neighborhood profile (Census ACS 5-year, census-tract level) ───────────────────────────────
const ACS_VARS = { income: "B19013_001E", home: "B25077_001E", rent: "B25064_001E", occ: "B25003_001E", owner: "B25003_002E", renter: "B25003_003E", age: "B01002_001E", hh: "B28002_001E", bband: "B28002_004E", pop: "B01003_001E" };
export async function acs(geo, key) {
  if (!geo?.stateFips || !geo?.countyFips || !geo?.tractFips) return null;
  const vars = Object.values(ACS_VARS).join(",");
  for (const year of [2024, 2023, 2022]) {
    const r = await getJSON(`https://api.census.gov/data/${year}/acs/acs5?get=NAME,${vars}&for=tract:${geo.tractFips}&in=state:${geo.stateFips}%20county:${geo.countyFips}${key ? "&key=" + encodeURIComponent(key) : ""}`, { ttl: 60 * DAY, timeout: 12000 });
    if (!r.ok || !Array.isArray(r.json) || r.json.length < 2) continue;
    const [head, row] = r.json; const v = (code) => { const n = Number(row[head.indexOf(code)]); return isFinite(n) && n >= 0 ? n : null; };
    const out = Object.fromEntries(Object.entries(ACS_VARS).map(([k, c]) => [k, v(c)]));
    return { ...out, year, ownerPct: out.occ ? Math.round((out.owner / out.occ) * 100) : null, broadbandPct: out.hh ? Math.round((out.bband / out.hh) * 100) : null };
  }
  return null;
}

// ── 3. Weather now + NWS alerts ──────────────────────────────────────────────────────────────────
const WX = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm" };
async function weather(geo) {
  const r = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`, { ttl: HOUR / 2 });
  const c = r.json?.current; if (!c) return null;
  return `${Math.round(c.temperature_2m)}°F, ${WX[c.weather_code] || "—"} · wind ${Math.round(c.wind_speed_10m)} mph`;
}
async function alerts(geo) {
  const r = await getJSON(`https://api.weather.gov/alerts/active?point=${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`, { headers: { accept: "application/geo+json" }, ttl: HOUR / 4 });
  if (!r.ok) return null;
  return (r.json?.features || []).map((f) => ({ event: f.properties?.event, severity: f.properties?.severity, until: f.properties?.ends || f.properties?.expires })).filter((a) => a.event).slice(0, 4);
}

// ── 4. Nearby stores (OpenStreetMap / Overpass) ──────────────────────────────────────────────────
const BRANDS = ["Verizon", "AT&T", "T-Mobile", "Metro by T-Mobile", "Cricket Wireless", "Boost Mobile", "Xfinity", "Spectrum"];
export async function nearby(geo) {
  const R = 16000;
  const q = `[out:json][timeout:20];(nwr(around:${R},${geo.lat},${geo.lng})["name"~"UPS",i]["shop"];nwr(around:${R},${geo.lat},${geo.lng})["amenity"="post_office"]["name"~"UPS",i];nwr(around:${R},${geo.lat},${geo.lng})["brand"~"^(${BRANDS.map((b) => b.replace(/[&-]/g, ".")).join("|")})",i];nwr(around:${R},${geo.lat},${geo.lng})["name"~"^(${BRANDS.map((b) => b.replace(/[&-]/g, ".")).join("|")})( |$)",i]["shop"];);out center 120;`;
  let r = null;
  for (const host of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    r = await getJSON(host, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded" }, ttl: 7 * DAY, timeout: 22000 });
    if (r.ok && r.json?.elements) break;
  }
  if (!r?.json?.elements) return null;
  const seen = new Set();
  const all = r.json.elements.map((e) => {
    const t = e.tags || {}; const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon; if (lat == null) return null;
    const name = t.brand || t.name || "Store";
    const addr = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"]].filter(Boolean).join(", ");
    const isUps = /ups/i.test(t.name || "") && !/supply|cups|groups/i.test(t.name || "");
    const brand = isUps ? "UPS" : BRANDS.find((b) => new RegExp("^" + b.replace(/[&-]/g, "."), "i").test(name)) || name;
    return { brand, name: t.name || name, addr, lat, lng, mi: milesBetween(geo, { lat, lng }) };
  }).filter(Boolean).filter((s) => { const k = s.name + Math.round(s.lat * 1e3) + Math.round(s.lng * 1e3); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.mi - b.mi);
  const ups = all.filter((s) => s.brand === "UPS").slice(0, 3);
  const carriers = {};
  for (const s of all) if (s.brand !== "UPS" && !carriers[s.brand]) carriers[s.brand] = s;
  return { ups, carriers: Object.values(carriers).slice(0, 6) };
}

// ── 5. USPS address check (free USPS developer key; OAuth client credentials) ─────────────────────
let uspsTok = { key: null, token: null, exp: 0 };
async function usps(cfg, geo) {
  if (!cfg?.clientId || !cfg?.clientSecret || !geo?.matched) return null;
  if (uspsTok.key !== cfg.clientId || Date.now() > uspsTok.exp) {
    const t = await getJSON("https://apis.usps.com/oauth2/v3/token", { method: "POST", headers: { "content-type": "application/json" }, body: { grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret } });
    if (!t.ok || !t.json?.access_token) throw new Error("USPS key rejected");
    uspsTok = { key: cfg.clientId, token: t.json.access_token, exp: Date.now() + (Number(t.json.expires_in || 3600) - 120) * 1000 };
  }
  const parts = geo.matched.split(",").map((s) => s.trim());
  const qs = new URLSearchParams({ streetAddress: parts[0] || "", city: geo.city || parts[1] || "", state: geo.state || "", ZIPCode: String(geo.zip || "").slice(0, 5) });
  const r = await getJSON(`https://apis.usps.com/addresses/v3/address?${qs}`, { headers: { authorization: `Bearer ${uspsTok.token}` }, ttl: 30 * DAY });
  if (!r.ok) throw new Error(r.json?.error?.message || `USPS ${r.status}`);
  const a = r.json?.address || {}, x = r.json?.additionalInfo || {};
  const dpv = { Y: "Deliverable", D: "Deliverable — missing apt/unit #", S: "Deliverable — unit # not recognised", N: "Not deliverable" }[x.DPVConfirmation] || "Unknown";
  return { std: [a.streetAddress, a.secondaryAddress, a.city, a.state, [a.ZIPCode, a.ZIPPlus4].filter(Boolean).join("-")].filter(Boolean).join(", "), dpv, ok: x.DPVConfirmation === "Y", business: x.business === "Y", vacant: x.vacant === "Y", route: x.carrierRoute };
}

export async function addressIntel(geoRes, cfgs) {
  const { geo, tried } = geoRes;
  if (!geo) return { error: "Couldn't find that address. Try street, city, state and ZIP.", sources: tried };
  const tz = geo.state ? tzFor(geo.state) : null;
  const [sAcs, sWx, sAl, sNear, sUsps] = await Promise.all([
    source("Census ACS neighbourhood", () => acs(geo, cfgs.census?.apiKey)),
    source("Open-Meteo weather", () => weather(geo)),
    source("National Weather Service alerts", () => alerts(geo)),
    source("OpenStreetMap stores", () => nearby(geo)),
    cfgs.usps ? source("USPS address API", () => usps(cfgs.usps, geo)) : Promise.resolve(null),
  ]);
  const facts = [
    ["Verified address", geo.matched, geo.exact ? "ok" : "warn"],
    ["Match quality", geo.exact ? `Exact (${geo.source})` : `Approximate — ${geo.source}`],
    ["County", geo.countyName || "—"],
    ["State", geo.state ? `${STATE_NAMES[geo.state] || geo.state} (${geo.state})` : "—"],
    ["Time zone", tz ? tz.zone : "—"],
    ["Coordinates", `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`],
  ];
  const badges = [];
  if (!geo.exact) badges.push({ text: "Address not exactly matched", tone: "warn" });
  else badges.push({ text: "Address verified", tone: "ok" });
  const u = sUsps?.data;
  if (u) {
    facts.splice(1, 0, ["USPS standard", u.std], ["USPS delivery", u.dpv, u.ok ? "ok" : "bad"], ["Type", u.business ? "Business address" : "Residential"]);
    if (u.vacant) { facts.push(["Vacant", "USPS marks this address vacant", "bad"]); badges.push({ text: "USPS: vacant", tone: "bad" }); }
    badges.push(u.ok ? { text: "USPS deliverable", tone: "ok" } : { text: "USPS: " + u.dpv, tone: "bad" });
    if (u.business) badges.push({ text: "Business address", tone: "info" });
  }
  if (sWx?.data) facts.push(["Weather there now", sWx.data]);
  const al = sAl?.data || [];
  if (al.length) { facts.push(["Weather alerts", al.map((a) => `${a.event}${a.severity && a.severity !== "Unknown" ? " (" + a.severity + ")" : ""}`).join(" · "), "warn"]); badges.push({ text: `${al.length} weather alert${al.length > 1 ? "s" : ""}`, tone: "warn" }); }
  const a = sAcs?.data;
  const hood = a ? [
    ["Median household income", money(a.income) || "—"],
    ["Median home value", money(a.home) || "—"],
    ["Median rent", a.rent ? money(a.rent) + "/mo" : "—"],
    ["Homeowners vs renters", a.ownerPct != null ? `${a.ownerPct}% own · ${100 - a.ownerPct}% rent` : "—"],
    ["Median age", a.age ? String(a.age) : "—"],
    ["Homes with broadband", a.broadbandPct != null ? `${a.broadbandPct}%` : "—"],
    ["Population (tract)", a.pop ? a.pop.toLocaleString("en-US") : "—"],
  ] : null;
  const near = sNear?.data;
  const q = encodeURIComponent(geo.matched);
  return {
    facts, badges, geo, hood, hoodNote: a ? `Census tract ${geo.tractName || geo.tractFips} · ACS ${a.year} 5-year estimates (area averages, not this household)` : null,
    stores: near ? { ups: near.ups, carriers: near.carriers } : null,
    map: { lat: geo.lat, lng: geo.lng },
    links: [
      { label: "Google Maps", href: `https://www.google.com/maps/search/?api=1&query=${q}` },
      { label: "Street View", href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${geo.lat},${geo.lng}` },
      { label: "Nearest UPS (map)", href: `https://www.google.com/maps/search/UPS+Store/@${geo.lat},${geo.lng},13z` },
    ],
    sources: [...tried, ...[sAcs, sWx, sAl, sNear, sUsps].filter(Boolean).map(({ name, ok, ms, note }) => ({ name, ok, ms, note }))],
  };
}
