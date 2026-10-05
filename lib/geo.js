// Free US geocoding + nearest UPS locations (no keys):
// address → coordinates: US Census geocoder, then OpenStreetMap Nominatim as a fallback.
// nearest UPS: OpenStreetMap (Overpass) — The UPS Store, UPS Customer Centers, UPS Access Points that are mapped.
const UA = { "user-agent": "Modo CRM (modo-crm1.vercel.app)" };
const R = 6371e3, rad = (d) => (d * Math.PI) / 180;
export const meters = (a, b) => { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

export async function geocode(address, zip) {
  const one = [address, zip && !String(address || "").includes(zip) ? zip : ""].filter(Boolean).join(" ").trim();
  if (!one) return null;
  try {
    const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({ address: one, benchmark: "Public_AR_Current", format: "json" })}`;
    const d = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json();
    const m = d?.result?.addressMatches?.[0];
    if (m) return { lat: m.coordinates.y, lng: m.coordinates.x, label: m.matchedAddress, exact: true };
  } catch {}
  try {
    const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: one, countrycodes: "us", format: "json", limit: "1" })}`;
    const d = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) })).json();
    if (d?.[0]) return { lat: +d[0].lat, lng: +d[0].lon, label: d[0].display_name, exact: false };
  } catch {}
  // Last try: just the ZIP code's area
  if (zip) {
    try {
      const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ postalcode: String(zip).slice(0, 5), countrycodes: "us", format: "json", limit: "1" })}`;
      const d = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) })).json();
      if (d?.[0]) return { lat: +d[0].lat, lng: +d[0].lon, label: "ZIP " + zip + " area", exact: false };
    } catch {}
  }
  return null;
}

// Fast UPS search: Photon (komoot) and Nominatim answer in well under a second and are asked in parallel.
// Overpass (slower, often busy) is only a last resort.
const isUps = (name = "", brand = "", op = "") => /\bUPS\b|UPS Store/i.test(`${name} ${brand} ${op}`) && !/groups|ups and downs|cups|pups|soups|sups/i.test(name);
const json = (u, init = {}) => fetch(u, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(init.timeout || 5000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

async function photon(q, lat, lng) {
  const d = await json(`https://photon.komoot.io/api/?${new URLSearchParams({ q, lat, lon: lng, limit: "15", lang: "en" })}`);
  return (d.features || []).map((f) => { const p = f.properties || {}; const [x, y] = f.geometry?.coordinates || [];
    return { name: p.name || "", lat: y, lng: x, addr: [[p.housenumber, p.street].filter(Boolean).join(" "), p.city, [p.state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", "), brand: p.osm_value === "post_office" ? "" : "" }; });
}
async function nominatim(q, lat, lng, km = 30) {
  const dLat = km / 111, dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  const d = await json(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "15", bounded: "1", addressdetails: "1", countrycodes: "us", viewbox: `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}` })}`);
  return (d || []).map((x) => { const a = x.address || {};
    return { name: x.name || x.display_name?.split(",")[0] || "", lat: +x.lat, lng: +x.lon, addr: [[a.house_number, a.road].filter(Boolean).join(" "), a.city || a.town || a.village || a.hamlet, [a.state, a.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") }; });
}
const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
async function overpass(lat, lng, radius) {
  const q = `[out:json][timeout:8];(nwr(around:${radius},${lat},${lng})["brand"~"UPS",i];nwr(around:${radius},${lat},${lng})["name"~"(^UPS|UPS Store)",i];);out center tags 40;`;
  const d = await Promise.any(MIRRORS.map((m) => json(m, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), timeout: 9000 })));
  return (d.elements || []).map((e) => { const t = e.tags || {};
    return { name: t.name || t.brand || "", brand: t.brand || "", lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, hours: t.opening_hours || "", phone: t.phone || "",
      addr: [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"], [t["addr:state"], t["addr:postcode"]].filter(Boolean).join(" ")].filter(Boolean).join(", ") }; });
}
function tidy(rows, lat, lng, limit) {
  const seen = new Set();
  return rows.filter((x) => x && x.lat != null && isUps(x.name, x.brand))
    .map((x) => ({ name: x.name, addr: x.addr || "", phone: x.phone || "", hours: x.hours || "", lat: x.lat, lng: x.lng, m: Math.round(meters({ lat, lng }, x)) }))
    .filter((x) => x.m < 80000)
    .sort((a, b) => a.m - b.m)
    .filter((x) => { const k = Math.round(x.lat * 2000) + ":" + Math.round(x.lng * 2000); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit);
}
export async function nearestUps({ lat, lng }, limit = 6) {
  const tries = await Promise.allSettled([photon("The UPS Store", lat, lng), photon("UPS Customer Center", lat, lng), nominatim("The UPS Store", lat, lng), nominatim("UPS", lat, lng, 20)]);
  let list = tidy(tries.flatMap((t) => (t.status === "fulfilled" ? t.value : [])), lat, lng, limit);
  if (list.length) return list;
  try { list = tidy(await overpass(lat, lng, 30000), lat, lng, limit); } catch { if (tries.every((t) => t.status === "rejected")) return null; }
  return list;
}
