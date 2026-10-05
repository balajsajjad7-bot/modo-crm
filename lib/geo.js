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

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
export async function nearestUps({ lat, lng }, limit = 6) {
  for (const radius of [15000, 40000]) {
    const q = `[out:json][timeout:20];(nwr(around:${radius},${lat},${lng})["brand"~"UPS",i];nwr(around:${radius},${lat},${lng})["name"~"(^UPS|UPS Store|UPS Customer|UPS Access)",i];nwr(around:${radius},${lat},${lng})["operator"~"^UPS",i];);out center tags 60;`;
    for (const m of MIRRORS) {
      try {
        const r = await fetch(m, { method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        const d = await r.json();
        const seen = new Set();
        const list = (d.elements || []).map((e) => {
          const p = { lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }; if (p.lat == null) return null;
          const t = e.tags || {};
          const addr = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"], [t["addr:state"], t["addr:postcode"]].filter(Boolean).join(" ")].filter(Boolean).join(", ");
          return { name: t.name || t.brand || "UPS", addr, phone: t.phone || t["contact:phone"] || "", hours: t.opening_hours || "", ...p, m: Math.round(meters({ lat, lng }, p)) };
        }).filter(Boolean).filter((x) => { const k = x.name + Math.round(x.lat * 1e4) + Math.round(x.lng * 1e4); if (seen.has(k)) return false; seen.add(k); return true; })
          .sort((a, b) => a.m - b.m).slice(0, limit);
        if (list.length) return list;
        break; // this mirror answered with nothing: widen the radius
      } catch {}
    }
  }
  return [];
}
