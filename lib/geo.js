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

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function overpass(q) {
  // Ask all mirrors at once and take the first good answer (free servers can be slow)
  const ask = (m) => fetch(m, { method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(14000) })
    .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); const d = await r.json(); if (!Array.isArray(d.elements)) throw new Error("bad"); return d; });
  return Promise.any(MIRRORS.map(ask));
}
export async function nearestUps({ lat, lng }, limit = 6) {
  for (const radius of [16000, 45000]) {
    const q = `[out:json][timeout:12];(nwr(around:${radius},${lat},${lng})["brand"~"UPS",i];nwr(around:${radius},${lat},${lng})["name"~"(^UPS|UPS Store|UPS Customer|UPS Access)",i];nwr(around:${radius},${lat},${lng})["operator"~"^UPS",i];);out center tags 60;`;
    let d; try { d = await overpass(q); } catch { return null; } // null = couldn't search right now
    const seen = new Set();
    const list = (d.elements || []).map((e) => {
      const p = { lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }; if (p.lat == null) return null;
      const t = e.tags || {};
      const addr = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"], [t["addr:state"], t["addr:postcode"]].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return { name: t.name || t.brand || "UPS", addr, phone: t.phone || t["contact:phone"] || "", hours: t.opening_hours || "", ...p, m: Math.round(meters({ lat, lng }, p)) };
    }).filter(Boolean).filter((x) => { const k = x.name + Math.round(x.lat * 1e4) + Math.round(x.lng * 1e4); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.m - b.m).slice(0, limit);
    if (list.length) return list;
  }
  return [];
}
