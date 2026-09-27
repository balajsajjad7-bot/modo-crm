import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, clientIp } from "@/lib/auth";
import { getSettings, ipAllowed } from "@/lib/settings";
import { resolveShift } from "@/lib/payroll";
import { clockIn, autoCloseStale, locationFor, inShiftWindow } from "@/lib/presence";

// Every open CRM tab calls this every 30 seconds. It keeps "last seen" fresh,
// clocks agents in automatically when they open the CRM during their shift, and sweeps quiet sessions.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const geo = b.lat != null ? { lat: Number(b.lat), lng: Number(b.lng), acc: Number(b.acc) || 0 } : null;
  const now = new Date();
  const cur = await db.user.findUnique({ where: { id: s.uid }, select: { idleSince: true } }).catch(() => null);
  const idleData = b.idle ? (cur?.idleSince ? {} : { idleSince: now }) : { idleSince: null };
  await db.user.update({ where: { id: s.uid }, data: { lastSeenAt: now, ...idleData } }).catch(() => {});
  await autoCloseStale().catch(() => {});
  const settings = await getSettings();
  const out = { needGeo: settings.officeLat != null, auto: settings.autoClockIn };
  if (s.role !== "AGENT") return NextResponse.json(out);

  const user = await db.user.findUnique({ where: { id: s.uid } });
  const ip = clientIp();
  const loc = locationFor(settings, ip, geo);
  const shiftDate = resolveShift(user, now).shiftDate;
  let a = await db.attendance.findUnique({ where: { userId_shiftDate: { userId: user.id, shiftDate } } });
  if (settings.autoClockIn && ipAllowed(settings, ip) && inShiftWindow(user, now) && (!a || (a.clockOut && a.autoOut))) {
    a = (await clockIn(user, { source: "auto", ip, location: loc.location, now })).attendance;
    out.clockedIn = true;
  } else if (a && !a.clockOut && loc.location && a.location !== loc.location && loc.location === "office") {
    a = await db.attendance.update({ where: { id: a.id }, data: { location: "office" } });
  }
  return NextResponse.json({ ...out, attendance: a, location: loc.location, how: loc.how, shiftEnded: !!(a?.clockOut && a?.note === "Clocked out automatically at shift end") });
}
