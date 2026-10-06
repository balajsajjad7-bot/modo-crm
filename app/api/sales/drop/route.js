import { NextResponse } from "next/server";
import { feed, tag } from "@/lib/salesFeed";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { trackingConfig, track } from "@/lib/tracking";

export const maxDuration = 40;
const DROP = /drop.?off|dropped|received by ups|received at|origin scan|access point|ups store|customer center|accepted at|shipper created a label.*drop/i;

// Where did the customer drop the return package?
// { id, check: true } → read it from the return label's UPS tracking (AfterShip)
// { id, store: { name, addr, lat, lng } } → mark it by hand ("Dropped here");  { id, clear: true } → remove
export async function POST(req) {
  const { error, session } = await requireManager("sales");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const s = await db.sale.findUnique({ where: { id: String(b.id || "") }, select: { id: true, returnTracking: true, trackingNo: true, carrier: true, orderNumber: true, customer: true, receipt: true, dropStore: true } });
  if (!s) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  let drop = null;
  if (b.clear) drop = null;
  else if (b.store?.name) drop = { name: String(b.store.name).slice(0, 120), addr: String(b.store.addr || "").slice(0, 200), lat: b.store.lat ?? null, lng: b.store.lng ?? null, at: new Date().toISOString(), how: "marked" };
  else if (b.check) {
    const num = s.returnTracking || s.trackingNo;
    if (!num) return NextResponse.json({ error: "No tracking number on this sale yet." }, { status: 400 });
    const cfg = await trackingConfig();
    if (!cfg) return NextResponse.json({ error: "Add the AfterShip key in Connectors → Order tracking so Modo can read UPS scans. Or tap “Dropped here” on the store." }, { status: 400 });
    let t; try { t = await track(cfg.apiKey, num, s.returnTracking ? "ups" : s.carrier); } catch (e) { return NextResponse.json({ error: "Tracking: " + e.message }, { status: 502 }); }
    const cps = t.checkpoints || [];
    const cp = cps.find((c) => DROP.test(c.msg || "")) || (t.status === "dropped_off" || t.status === "in_transit" ? cps[0] : null);
    if (!cp) return NextResponse.json({ ok: true, drop: null, note: "Not dropped off yet — UPS has no drop-off scan." });
    const named = (cp.msg || "").match(/(The UPS Store[^,.;]*|UPS Access Point[^,.;]*|UPS Customer Center[^,.;]*)/i)?.[1];
    drop = { name: named || "UPS drop-off", addr: cp.loc || "", at: cp.at || new Date().toISOString(), how: "tracking", msg: (cp.msg || "").slice(0, 160) };
  }
  await db.sale.update({ where: { id: s.id }, data: { dropStore: drop ? JSON.stringify(drop) : null } });
  if (drop && (!s.dropStore || b.store)) await feed(`🏪 ${tag(s)} package dropped at ${drop.name}${drop.addr ? ", " + drop.addr : ""} (${drop.how === "tracking" ? "from UPS tracking" : "marked by " + session.name})`);
  else if (!drop && s.dropStore) await feed(`↩️ ${tag(s)} drop-off removed by ${session.name}`);
  return NextResponse.json({ ok: true, drop });
}
