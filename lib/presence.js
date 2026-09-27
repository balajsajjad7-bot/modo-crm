// Automatic attendance: office detection (Wi-Fi/IP or GPS geofence), auto clock-in, auto clock-out.
import crypto from "crypto";
import { db } from "./db";
import { getSettings } from "./settings";
import { lateness, resolveShift, shiftBounds } from "./payroll";
import { emit } from "./connectors";
import { dur } from "./fmt";

export function distanceM(a, b, c, d) {
  const R = 6371000, t = (x) => (x * Math.PI) / 180;
  const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const officeIps = (s) => s.officeIps.split(/[\s,]+/).filter(Boolean);

// "office" when on an office IP or inside the geofence; "remote" when an office is configured but they're elsewhere.
export function locationFor(s, ip, geo) {
  const ips = officeIps(s);
  if (ip && ips.includes(ip)) return { location: "office", how: "office Wi-Fi" };
  if (geo && s.officeLat != null && s.officeLng != null && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
    const m = distanceM(s.officeLat, s.officeLng, geo.lat, geo.lng);
    if (m <= (s.officeRadius || 150) + Math.min(geo.acc || 0, 100)) return { location: "office", how: `GPS, ${Math.round(m)} m from office` };
    return { location: "remote", how: `GPS, ${m > 2000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m"} away` };
  }
  if (ips.length || s.officeLat != null) return { location: "remote", how: "not on office network" };
  return { location: null, how: null };
}

// Within the window where an arrival counts for today's shift: from 4h before start until the shift ends.
export function inShiftWindow(user, now = new Date()) {
  const { start } = resolveShift(user, now);
  const diff = now - start;
  return diff >= -4 * 3600000 && diff <= (user.shiftHours || 9) * 3600000;
}

// Clock someone in (once per shift). Returns { attendance, created }.
export async function clockIn(user, { source = "login", ip = null, location = null, now = new Date() } = {}) {
  const l = lateness(user, now);
  const key = { userId_shiftDate: { userId: user.id, shiftDate: l.shiftDate } };
  const existing = await db.attendance.findUnique({ where: key });
  if (existing) {
    const data = {};
    if (location === "office" && existing.location !== "office") data.location = "office";
    if (existing.clockOut && existing.autoOut && existing.note !== SHIFT_END && inShiftWindow(user, now)) { data.clockOut = null; data.autoOut = false; } // came back after going quiet
    const a = Object.keys(data).length ? await db.attendance.update({ where: { id: existing.id }, data }) : existing;
    return { attendance: a, created: false };
  }
  const a = await db.attendance.create({ data: { userId: user.id, shiftDate: l.shiftDate, clockIn: now, lateSeconds: l.lateSeconds, deduction: l.deduction, ip, source, location } });
  if (l.lateSeconds > 0) await emit("attendance.late", { agent: `${user.name} (${user.agentId})`, late: dur(l.lateSeconds), deduction: l.deduction, how: source });
  return { attendance: a, created: true };
}

export const SHIFT_END = "Clocked out automatically at shift end";

// Clock out anyone who has gone quiet (no open CRM tab) for longer than the setting. Runs at most once a minute.
let lastSweep = 0;
export async function autoCloseStale(force = false) {
  if (!force && Date.now() - lastSweep < 60000) return;
  lastSweep = Date.now();
  const s = await getSettings();
  const cutoff = new Date(Date.now() - (s.autoClockOut || 30) * 60000);
  const open = await db.attendance.findMany({ where: { clockOut: null } });
  if (!open.length) return;
  const users = await db.user.findMany({ where: { id: { in: open.map((a) => a.userId) } }, select: { id: true, lastSeenAt: true, shiftStart: true, shiftHours: true } });
  for (const a of open) {
    const u = users.find((x) => x.id === a.userId);
    // 1) Shift is over: clock out at the shift's end time
    if (s.shiftEndOut && u) {
      const { end } = shiftBounds(u, a.shiftDate);
      if (Date.now() > end.getTime() + (s.shiftEndGrace || 0) * 60000 && end > a.clockIn) {
        await db.attendance.update({ where: { id: a.id }, data: { clockOut: end, autoOut: true, note: SHIFT_END } });
        await db.breakLog.updateMany({ where: { userId: a.userId, end: null }, data: { end } });
        continue;
      }
    }
    // 2) Gone quiet (all CRM tabs closed) for too long
    if (a.clockIn >= cutoff) continue;
    const seen = u?.lastSeenAt ? new Date(u.lastSeenAt) : new Date(a.clockIn);
    if (seen < cutoff) {
      const out = seen < a.clockIn ? a.clockIn : seen;
      await db.attendance.update({ where: { id: a.id }, data: { clockOut: out, autoOut: true } });
      await db.breakLog.updateMany({ where: { userId: a.userId, end: null }, data: { end: out } });
    }
  }
}

// Rotating QR token for the office kiosk (changes every 20 seconds).
const WINDOW = 20000;
const sign = (w) => crypto.createHmac("sha256", process.env.JWT_SECRET || "dev-secret").update("kiosk:" + w).digest("base64url").slice(0, 18);
export const kioskToken = () => { const w = Math.floor(Date.now() / WINDOW); return { token: sign(w), expiresIn: WINDOW - (Date.now() % WINDOW) }; };
export const kioskValid = (t) => { const w = Math.floor(Date.now() / WINDOW); return !!t && [w, w - 1, w - 2].some((x) => sign(x) === t); };
