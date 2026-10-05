import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { geocode, nearestUps } from "@/lib/geo";

export const maxDuration = 45;
// ?id=…            → the customer's location (fast; saved on the sale) + any saved UPS list
// ?id=…&stores=1   → find the nearest UPS locations (slower; saved, refreshed monthly)
// &refresh=1       → look everything up again
export async function GET(req) {
  const { error } = await requireManager("sales");
  if (error) return error;
  const q = new URL(req.url).searchParams;
  const s = await db.sale.findUnique({ where: { id: String(q.get("id") || "") }, select: { id: true, address: true, zip: true, geoLat: true, geoLng: true, geoStores: true, geoAt: true } });
  if (!s) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  const refresh = q.get("refresh") === "1";
  let lat = s.geoLat, lng = s.geoLng, label = null;
  if (lat == null || refresh) {
    const g = await geocode(s.address, s.zip);
    if (!g) return NextResponse.json({ error: "Couldn't find this address on the map. Check the street, city, state and ZIP on the sale." }, { status: 422 });
    lat = g.lat; lng = g.lng; label = g.label;
    await db.sale.update({ where: { id: s.id }, data: { geoLat: lat, geoLng: lng, ...(refresh ? { geoStores: null, geoAt: null } : {}) } }).catch(() => {});
  }
  let stores = null; try { stores = s.geoStores && !refresh ? JSON.parse(s.geoStores) : null; } catch {}
  const stale = !s.geoAt || Date.now() - new Date(s.geoAt) > 30 * 864e5 || lat !== s.geoLat;
  if (q.get("stores") === "1" && (stale || !stores?.length || refresh)) {
    const found = await nearestUps({ lat, lng });
    if (found === null) return NextResponse.json({ lat, lng, label, stores: stores || [], storesError: "The free map search is busy right now. Tap refresh in a minute." });
    stores = found;
    await db.sale.update({ where: { id: s.id }, data: { geoStores: JSON.stringify(stores), geoAt: new Date() } }).catch(() => {});
  }
  return NextResponse.json({ lat, lng, label, stores: stores || [], storesPending: !stores });
}
