import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { geocode, nearestUps } from "@/lib/geo";

export const maxDuration = 45;
// The customer's location + nearest UPS locations for a sale (saved on the sale; UPS list refreshed monthly).
export async function GET(req) {
  const { error } = await requireManager("sales");
  if (error) return error;
  const q = new URL(req.url).searchParams;
  const s = await db.sale.findUnique({ where: { id: String(q.get("id") || "") }, select: { id: true, address: true, zip: true, geoLat: true, geoLng: true, geoStores: true, geoAt: true } });
  if (!s) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  const fresh = q.get("refresh") === "1";
  let lat = s.geoLat, lng = s.geoLng, label = null;
  if (lat == null || fresh) {
    const g = await geocode(s.address, s.zip);
    if (!g) return NextResponse.json({ error: "Couldn't find this address on the map. Check the street, city, state and ZIP." }, { status: 422 });
    lat = g.lat; lng = g.lng; label = g.label;
  }
  let stores = []; try { stores = JSON.parse(s.geoStores || "[]"); } catch {}
  const old = !s.geoAt || Date.now() - new Date(s.geoAt) > 30 * 864e5;
  if (fresh || old || lat !== s.geoLat || !stores.length) {
    stores = await nearestUps({ lat, lng });
    await db.sale.update({ where: { id: s.id }, data: { geoLat: lat, geoLng: lng, geoStores: JSON.stringify(stores), geoAt: new Date() } }).catch(() => {});
  }
  return NextResponse.json({ lat, lng, label, stores });
}
