import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, requireRole, requireManager } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { distanceM } from "@/lib/presence";
import { sendPush } from "@/lib/push";

// Agent's device reports its location; Modo tracks entering/leaving the office geofence.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { lat, lng, acc } = await req.json().catch(() => ({}));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "No location." }, { status: 400 });
  const st = await getSettings();
  if (st.officeLat == null || st.officeLng == null) return NextResponse.json({ officeSet: false });
  const m = distanceM(st.officeLat, st.officeLng, lat, lng);
  const inside = m <= (st.officeRadius || 150) + Math.min(acc || 0, 100);
  const u = await db.user.findUnique({ where: { id: s.uid }, select: { geoInside: true, name: true, agentId: true, role: true } });
  await db.user.update({ where: { id: s.uid }, data: { lastSeenAt: new Date() } }).catch(() => {});
  if (u && u.role === "AGENT" && u.geoInside !== inside) {
    const type = inside ? "returned" : "left";
    await db.user.update({ where: { id: s.uid }, data: { geoInside: inside, geoAt: new Date() } });
    await db.geoEvent.create({ data: { userId: s.uid, type, distance: Math.round(m), lat, lng } });
    // Alert admins (best-effort push).
    try {
      const admins = (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })).map((a) => a.id);
      if (admins.length) sendPush(admins, { title: inside ? `${u.name} is back at the office` : `⚠ ${u.name} left the office`, body: inside ? "Returned to the office area." : `Now ${m > 2000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m"} from the office.`, url: "/admin/whereabouts", urgent: !inside, tag: "geo-" + s.uid });
    } catch {}
  }
  return NextResponse.json({ officeSet: true, inside, distance: Math.round(m) });
}

// Admin: everyone's current in/out state + today's leave/return log.
export async function GET() {
  const { error } = await requireManager("whereabouts");
  if (error) return error;
  const st = await getSettings();
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true, geoInside: true, geoAt: true, lastSeenAt: true } });
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const events = await db.geoEvent.findMany({ where: { at: { gte: since } }, orderBy: { at: "desc" }, take: 200 });
  const online = (d) => !!d && Date.now() - new Date(d) < 90000;
  return NextResponse.json({
    officeSet: st.officeLat != null && st.officeLng != null,
    radius: st.officeRadius || 150,
    agents: agents.map((a) => ({ ...a, online: online(a.lastSeenAt) })),
    events: events.map((e) => ({ ...e, name: agents.find((a) => a.id === e.userId)?.name || "Agent" })),
  });
}
