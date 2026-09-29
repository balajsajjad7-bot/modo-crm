import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { parse } from "@/lib/connectors";
import { getSettings } from "@/lib/settings";
import { areaInfo, tzFor, stateFromName, STATE_NAMES } from "@/lib/usdata";

const get = async (url, opts = {}) => {
  const { dispatcher, ...rest } = opts;
  const r = await fetch(url, { ...rest, headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CRM-Modo/1.0", accept: "application/json,text/html;q=0.9,*/*;q=0.8", ...(opts.headers || {}) }, signal: AbortSignal.timeout(15000), cache: "no-store", ...(dispatcher ? { dispatcher } : {}) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, json, text };
};

// Optional "Modo VPN": route these lookups through a proxy the admin configured, so requests
// leave from that endpoint instead of Modo's own server IP. Cached per proxy string.
let _pxy = { url: undefined, agent: undefined };
async function proxyDispatcher() {
  const proxy = (await getSettings()).lookupProxy;
  if (!proxy) return undefined;
  if (_pxy.url === proxy) return _pxy.agent;
  try { const { ProxyAgent } = await import(/* webpackIgnore: true */ "undici"); _pxy = { url: proxy, agent: new ProxyAgent(proxy) }; }
  catch { _pxy = { url: proxy, agent: undefined }; }
  return _pxy.agent;
}
const hostName = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "Lookup"; } };

// Your own free lookups: just a URL with {q}. Modo fetches it server-side (optionally via the proxy).
async function urlLookup(tmpl, q, dispatcher) {
  const url = tmpl.replace(/\{q\}/g, encodeURIComponent(q));
  const r = await get(url, { dispatcher });
  if (!r.ok) throw new Error(`That lookup answered ${r.status}. If it needs a US/other location, set a proxy in Settings → Your own lookups.`);
  const flat = [];
  const walk = (o, pre = "") => { if (flat.length > 60) return; if (o && typeof o === "object") { for (const [k, v] of Object.entries(o)) walk(v, pre ? `${pre} › ${k}` : k); } else flat.push([pre || "result", String(o)]); };
  if (r.json != null) walk(r.json); else flat.push(["result", (r.text || "").slice(0, 4000)]);
  return { title: `${hostName(tmpl)}: ${q}`, rows: flat, note: "Your own lookup — fetched by Modo's server." };
}

async function zip(q) {
  const z = String(q).replace(/\D/g, "").slice(0, 5);
  if (z.length !== 5) throw new Error("Enter a 5-digit ZIP code.");
  const r = await get(`https://api.zippopotam.us/us/${z}`);
  if (!r.ok) throw new Error(`ZIP ${z} wasn't found.`);
  const p = r.json.places?.[0] || {}; const st = p["state abbreviation"]; const tz = tzFor(st);
  return { title: `${p["place name"]}, ${st} ${z}`, rows: [["City", r.json.places.map((x) => x["place name"]).join(", ")], ["State", `${p.state} (${st})`], ["Time zone", tz ? `${tz.zone}${tz.note ? " · " + tz.note : ""}` : "—"], ["Local time now", tz ? `${tz.local}${tz.callable ? " · OK to call" : " · outside 8am–9pm, don't call"}` : "—"], ["Coordinates", `${p.latitude}, ${p.longitude}`]], map: { lat: +p.latitude, lng: +p.longitude } };
}
async function address(q) {
  const u = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const r = await get(u);
  const m = r.json?.result?.addressMatches?.[0];
  if (!m) throw new Error("No match. Try the full street, city, state and ZIP.");
  const g = m.geographies || {}; const county = g.Counties?.[0]; const st = m.addressComponents?.state; const tz = tzFor(st);
  return { title: m.matchedAddress, rows: [["Verified address", m.matchedAddress], ["County", county ? county.NAME : "—"], ["State", STATE_NAMES[st] ? `${STATE_NAMES[st]} (${st})` : st || "—"], ["ZIP", m.addressComponents?.zip || "—"],
    ["Census tract", g["Census Tracts"]?.[0]?.NAME || "—"], ["Time zone", tz ? tz.zone : "—"], ["Local time now", tz ? `${tz.local}${tz.callable ? " · OK to call" : " · outside 8am–9pm"}` : "—"], ["Coordinates", `${m.coordinates.y.toFixed(5)}, ${m.coordinates.x.toFixed(5)}`]],
    map: { lat: m.coordinates.y, lng: m.coordinates.x }, note: "Source: US Census Bureau geocoder (free, official)." };
}
function phone(q) {
  let d = String(q).replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length !== 10) throw new Error("Enter a 10-digit US number.");
  const ac = d.slice(0, 3), ex = d.slice(3, 6);
  const valid = /^[2-9]\d\d$/.test(ac) && /^[2-9]\d\d$/.test(ex);
  const info = areaInfo(ac); const tz = info?.state ? tzFor(info.state) : null;
  return { title: `(${ac}) ${ex}-${d.slice(6)}`, rows: [["Format", `+1 (${ac}) ${ex}-${d.slice(6)}`], ["Valid US format", valid ? "Yes" : "No: area code and exchange can't start with 0 or 1"],
    ["Area code", info?.tollFree ? `${ac} · toll-free` : info ? `${ac} · ${info.stateName}` : `${ac} · not a US area code (or new)`], ["Time zone", tz ? `${tz.zone}${tz.note ? " · " + tz.note : ""}` : "—"],
    ["Local time now", tz ? `${tz.local}${tz.callable ? " · OK to call" : " · outside 8am–9pm, don't call"}` : "—"], ["Carrier / line type", "Add a phone API in Connectors → Lookup API (e.g. NumVerify, Twilio Lookup)"]],
    note: "Area code shows where the number was issued; people keep numbers when they move." };
}
async function email(q) {
  const e = String(q).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) throw new Error("That doesn't look like an email address.");
  const domain = e.split("@")[1];
  const r = await get(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
  const mx = (r.json?.Answer || []).filter((a) => a.type === 15).map((a) => a.data.split(" ").pop().replace(/\.$/, ""));
  const disposable = /mailinator|guerrillamail|10minutemail|tempmail|trashmail|yopmail|sharklasers|getnada|temp-mail|dispostable/.test(domain);
  const free = /gmail|yahoo|hotmail|outlook|live\.|aol|icloud|me\.com|proton|gmx|zoho|mail\.com/.test(domain);
  return { title: e, rows: [["Format", "Valid"], ["Domain accepts email", mx.length ? "Yes" : "No mail server found: probably a typo"], ["Mail servers", mx.slice(0, 3).join(", ") || "—"],
    ["Type", disposable ? "Throwaway address ⚠" : free ? "Personal (free provider)" : "Business / own domain"]], note: "This checks the domain, not whether the exact mailbox exists." };
}
function timeIn(q) {
  const st = stateFromName(q); if (!st) throw new Error("Enter a state name or 2-letter code, e.g. TX or Texas.");
  const tz = tzFor(st);
  return { title: `${STATE_NAMES[st]} (${st})`, rows: [["Time zone", tz.zone], ["Local time now", tz.local], ["OK to call (8am–9pm)?", tz.callable ? "Yes" : "No"], ["Note", tz.note || "—"]] };
}
async function custom(c, q) {
  const cfg = parse(c);
  if (!cfg.url) throw new Error("This lookup has no URL yet (Admin → Connectors).");
  const url = cfg.url.replace(/\{q\}/g, encodeURIComponent(q)).replace(/\{key\}/g, encodeURIComponent(cfg.apiKey || ""));
  const headers = cfg.header && cfg.apiKey ? { [cfg.header]: cfg.apiKey } : {};
  const r = await get(url, { headers, dispatcher: await proxyDispatcher() });
  if (!r.ok) throw new Error(`${c.name} answered ${r.status}: ${(r.json?.message || r.json?.error?.message || r.text || "").toString().slice(0, 200)}`);
  const flat = [];
  const walk = (o, pre = "") => { if (flat.length > 40) return; if (o && typeof o === "object") { for (const [k, v] of Object.entries(o)) walk(v, pre ? `${pre} › ${k}` : k); } else flat.push([pre || "result", String(o)]); };
  walk(r.json ?? r.text);
  return { title: `${c.name}: ${q}`, rows: flat };
}


async function zipPoint(z) {
  const r = await get(`https://api.zippopotam.us/us/${z}`);
  if (!r.ok) throw new Error(`ZIP ${z} wasn't found.`);
  const p = r.json.places?.[0] || {};
  return { z, city: p["place name"], st: p["state abbreviation"], lat: +p.latitude, lng: +p.longitude };
}
async function cityZips(q) {
  const m = String(q).match(/^\s*(.+?)[,\s]+([a-z]{2}|[a-z ]{4,})\s*$/i);
  const st = m && stateFromName(m[2]); if (!m || !st) throw new Error("Type a city and state, e.g. Austin, TX");
  const r = await get(`https://api.zippopotam.us/us/${st.toLowerCase()}/${encodeURIComponent(m[1].trim().toLowerCase())}`);
  if (!r.ok || !r.json?.places?.length) throw new Error(`No ZIP codes found for ${m[1]}, ${st}.`);
  const zips = r.json.places.map((x) => x["post code"]).sort();
  const tz = tzFor(st);
  return { title: `${r.json["place name"]}, ${st}`, rows: [["ZIP codes", `${zips.length}: ${zips.slice(0, 40).join(", ")}${zips.length > 40 ? "…" : ""}`], ["Time zone", tz ? tz.zone : "—"], ["Local time now", tz ? tz.local : "—"]] };
}
async function distance(q) {
  const zs = (String(q).match(/\b\d{5}\b/g) || []).slice(0, 2);
  if (zs.length !== 2) throw new Error("Type two ZIP codes, e.g. 78731 to 30303");
  const [a, b] = await Promise.all(zs.map(zipPoint));
  const R = 3958.8, rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  const mi = 2 * R * Math.asin(Math.sqrt(h));
  return { title: `${a.city}, ${a.st} → ${b.city}, ${b.st}`, rows: [["Straight-line distance", `${Math.round(mi).toLocaleString()} miles (${Math.round(mi * 1.609).toLocaleString()} km)`], ["Rough drive", mi < 5 ? "a few minutes" : `about ${Math.round((mi * 1.25) / 55)}–${Math.round((mi * 1.25) / 45) + 1} hours`], ["From", `${a.city}, ${a.st} ${a.z}`], ["To", `${b.city}, ${b.st} ${b.z}`]] };
}
const WX = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail" };
async function weather(q) {
  const z = String(q).replace(/\D/g, "").slice(0, 5); if (z.length !== 5) throw new Error("Enter the customer's ZIP code.");
  const p = await zipPoint(z);
  const r = await get(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=2&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`);
  if (!r.ok) throw new Error("Weather service didn't answer. Try again.");
  const c = r.json.current, d = r.json.daily;
  return { title: `Weather in ${p.city}, ${p.st}`, rows: [["Now", `${Math.round(c.temperature_2m)}°F, ${WX[c.weather_code] || "—"}`], ["Feels like", `${Math.round(c.apparent_temperature)}°F`], ["Wind / humidity", `${Math.round(c.wind_speed_10m)} mph · ${c.relative_humidity_2m}%`],
    ["Today", `${Math.round(d.temperature_2m_min[0])}–${Math.round(d.temperature_2m_max[0])}°F · ${WX[d.weather_code[0]] || ""}`], ["Tomorrow", `${Math.round(d.temperature_2m_min[1])}–${Math.round(d.temperature_2m_max[1])}°F · ${WX[d.weather_code[1]] || ""}`]],
    note: "Handy small talk, and hot or cold weather means bigger energy bills. Source: Open-Meteo (free)." };
}
function holidays(q) {
  const y = Number(String(q).match(/\b(20\d\d)\b/)?.[1]) || new Date().getFullYear();
  const nth = (m, wd, n) => { const d = new Date(Date.UTC(y, m, 1)); const off = (wd - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, m, 1 + off + (n - 1) * 7)); };
  const last = (m, wd) => { const d = new Date(Date.UTC(y, m + 1, 0)); return new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() - wd + 7) % 7))); };
  const H = [["New Year's Day", new Date(Date.UTC(y, 0, 1))], ["Martin Luther King Jr. Day", nth(0, 1, 3)], ["Presidents' Day", nth(1, 1, 3)], ["Memorial Day", last(4, 1)], ["Juneteenth", new Date(Date.UTC(y, 5, 19))],
    ["Independence Day", new Date(Date.UTC(y, 6, 4))], ["Labor Day", nth(8, 1, 1)], ["Columbus Day", nth(9, 1, 2)], ["Veterans Day", new Date(Date.UTC(y, 10, 11))], ["Thanksgiving", nth(10, 4, 4)], ["Christmas Day", new Date(Date.UTC(y, 11, 25))]];
  const today = new Date(); const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const next = H.find(([, d]) => d.getTime() >= t0);
  return { title: `US federal holidays ${y}`, rows: [...H.map(([n, d]) => [n, d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) + (d.getTime() === t0 ? " · TODAY" : "")]),
    ["Next holiday", next ? `${next[0]} (${Math.round((next[1] - t0) / 86400000)} days)` : "—"], ["Calling rule", "Telemarketing calls only 8am–9pm in the customer's local time (TCPA); some states are stricter."]] };
}

// GET ?type=zip|address|phone|email|time|city|distance|weather|holidays|custom&q=...&id=<connector id for custom>
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const p = new URL(req.url).searchParams; const type = p.get("type"); const q = (p.get("q") || "").trim().slice(0, 300);
  if (type === "list") {
    const list = await db.connector.findMany({ where: { type: "lookup", enabled: true }, orderBy: { createdAt: "asc" } });
    const conn = list.map((c) => ({ id: "c:" + c.id, name: c.name, hint: parse(c).hint || "" }));
    let urls = [];
    try { urls = JSON.parse((await getSettings()).lookupUrls || "[]"); } catch {}
    const urlItems = (Array.isArray(urls) ? urls : []).map((u, i) => ({ id: "u:" + i, name: hostName(u), hint: "Your lookup" }));
    return NextResponse.json([...conn, ...urlItems]);
  }
  if (!q && type !== "holidays") return NextResponse.json({ error: "Type something to look up." }, { status: 400 });
  try {
    let out;
    if (type === "zip") out = await zip(q); else if (type === "address") out = await address(q); else if (type === "phone") out = phone(q);
    else if (type === "email") out = await email(q); else if (type === "time") out = timeIn(q);
    else if (type === "city") out = await cityZips(q); else if (type === "distance") out = await distance(q); else if (type === "weather") out = await weather(q); else if (type === "holidays") out = holidays(q);
    else if (type === "custom") { const c = await db.connector.findFirst({ where: { id: p.get("id"), type: "lookup", enabled: true } }); if (!c) throw new Error("Lookup not found."); out = await custom(c, q); }
    else if (type === "urllookup") { let urls = []; try { urls = JSON.parse((await getSettings()).lookupUrls || "[]"); } catch {} const t = urls[parseInt(p.get("i"))]; if (!t) throw new Error("Lookup not found."); out = await urlLookup(t, q, await proxyDispatcher()); }
    else throw new Error("Unknown lookup.");
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ error: e.message || "Lookup failed." }, { status: 400 }); }
}
