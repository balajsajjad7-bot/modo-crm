import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, clientIp, currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { clearLockCache } from "@/lib/lock";

// Admin gets everything; agents get only what the discount calculator needs.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const st = await getSettings();
  if (s.role !== "ADMIN") return NextResponse.json({ currency: st.currency, discountRates: st.discountRates });
  return NextResponse.json({ ...st, yourIp: clientIp() });
}

// Partial update: only the fields sent are changed
export async function PATCH(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json();
  const data = {};
  if ("ipLock" in b) data.ipLock = !!b.ipLock;
  if ("officeIps" in b) data.officeIps = String(b.officeIps || "").trim();
  if ("breakAllowance" in b) data.breakAllowance = Math.max(0, parseInt(b.breakAllowance) || 0);
  if ("idleAfter" in b) data.idleAfter = Math.max(1, parseInt(b.idleAfter) || 5);
  if ("dailyTarget" in b) data.dailyTarget = Math.max(0, parseInt(b.dailyTarget) || 0);
  if ("bonusPerSale" in b) data.bonusPerSale = Math.max(0, Number(b.bonusPerSale) || 0);
  if ("autoClockIn" in b) data.autoClockIn = !!b.autoClockIn;
  if ("shiftEndOut" in b) data.shiftEndOut = !!b.shiftEndOut;
  if ("shiftEndGrace" in b) data.shiftEndGrace = Math.min(240, Math.max(0, parseInt(b.shiftEndGrace) || 0));
  if ("autoClockOut" in b) data.autoClockOut = Math.min(600, Math.max(5, parseInt(b.autoClockOut) || 30));
  if ("officeRadius" in b) data.officeRadius = Math.min(5000, Math.max(20, parseInt(b.officeRadius) || 150));
  if ("officeLat" in b) data.officeLat = b.officeLat === null || b.officeLat === "" ? null : Number(b.officeLat);
  if ("officeLng" in b) data.officeLng = b.officeLng === null || b.officeLng === "" ? null : Number(b.officeLng);
  if (("officeLat" in data && data.officeLat !== null && !Number.isFinite(data.officeLat)) || ("officeLng" in data && data.officeLng !== null && !Number.isFinite(data.officeLng))) return NextResponse.json({ error: "Office location must be numbers (latitude, longitude)." }, { status: 400 });
  if ("lockdown" in b) data.lockdown = !!b.lockdown;
  if ("monitorNotice" in b) data.monitorNotice = !!b.monitorNotice;
  if ("lockdownMsg" in b) data.lockdownMsg = String(b.lockdownMsg || "").slice(0, 300) || null;
  if ("require2fa" in b) data.require2fa = ["none", "admins", "everyone"].includes(b.require2fa) ? b.require2fa : "none";
  if ("currency" in b) data.currency = String(b.currency || "$").slice(0, 4);
  if (typeof b.discountRates === "string") { try { b.discountRates = JSON.parse(b.discountRates); } catch { delete b.discountRates; } }
  if ("discountRates" in b) {
    const rates = {};
    for (const [k, v] of Object.entries(b.discountRates || {})) { const n = String(k).trim().slice(0, 30); if (n) rates[n] = Math.min(100, Math.max(0, Number(v) || 0)); }
    if (!Object.keys(rates).length) return NextResponse.json({ error: "Add at least one service." }, { status: 400 });
    data.discountRates = JSON.stringify(rates);
  }
  const cur = await getSettings();
  if ((data.ipLock ?? cur.ipLock) && !(data.officeIps ?? cur.officeIps)) return NextResponse.json({ error: "Add at least one office IP before turning on the IP lock." }, { status: 400 });
  const out = await db.setting.update({ where: { id: "global" }, data });
  clearLockCache();
  if ("lockdown" in data) await db.huddle.updateMany({ where: { endedAt: null }, data: { endedAt: data.lockdown ? new Date() : undefined } }).catch(() => {});
  return NextResponse.json(out);
}
