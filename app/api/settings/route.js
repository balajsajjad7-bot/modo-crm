import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole, requireAdminOnly, clientIp, currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { clearLockCache } from "@/lib/lock";

// Admin gets everything; agents get only what the discount calculator needs.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const st = await getSettings();
  if (s.role !== "ADMIN") {
    // Agents never get "pay a bill" links — strip them before sending.
    let ql = st.quickLinks;
    try {
      const arr = JSON.parse(st.quickLinks || "[]");
      const isPay = (l) => /\bpay\b|pay-?bill|bill-?pay|payment|\/bill|billing|quick-?pay|doxo/i.test(((l.label || "") + " " + (l.url || "")));
      ql = JSON.stringify((Array.isArray(arr) ? arr : []).filter((l) => !isPay(l)));
    } catch {}
    return NextResponse.json({ currency: st.currency, discountRates: st.discountRates, creatorName: st.creatorName, switchOn: !!st.switchHash, quickLinks: ql });
  }
  const { switchHash, ...safe } = st; // never send the passphrase hash to the browser
  return NextResponse.json({ ...safe, switchSet: !!switchHash, yourIp: clientIp() });
}

// Partial update: only the fields sent are changed
export async function PATCH(req) {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const b = await req.json();
  const data = {};
  // Creator name + agent→admin switch passphrase: CEO only.
  if ("creatorName" in b || "switchPassword" in b || b.clearSwitch) {
    const meU = await db.user.findUnique({ where: { id: session.uid }, select: { ceo: true } });
    if (!meU?.ceo) return NextResponse.json({ error: "Only the CEO can change the creator name or switch passphrase." }, { status: 403 });
    if ("creatorName" in b) data.creatorName = String(b.creatorName || "").trim().slice(0, 40) || "Balaj";
    if (b.clearSwitch) data.switchHash = null;
    else if (typeof b.switchPassword === "string" && b.switchPassword.trim()) {
      if (b.switchPassword.trim().length < 6) return NextResponse.json({ error: "Switch passphrase needs at least 6 characters." }, { status: 400 });
      data.switchHash = await bcrypt.hash(b.switchPassword.trim(), 10);
    }
  }
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
  if ("lookupUrls" in b) {
    let arr = b.lookupUrls;
    if (typeof arr === "string") { const t = arr.trim(); if (t.startsWith("[")) { try { arr = JSON.parse(t); } catch { arr = arr.split(/\r?\n/); } } else arr = arr.split(/\r?\n/); } // JSON round-trip or a textarea (one URL per line)
    if (!Array.isArray(arr)) arr = [];
    const clean = arr.map((u) => String(u || "").trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 30);
    data.lookupUrls = JSON.stringify(clean);
  }
  if ("onboardMsg" in b) data.onboardMsg = String(b.onboardMsg || "").slice(0, 5000) || null;
  if ("companyName" in b) data.companyName = String(b.companyName || "").slice(0, 120) || null;
  if ("quickLinks" in b) {
    let arr = b.quickLinks;
    if (typeof arr === "string") { const t = arr.trim(); if (t.startsWith("[")) { try { arr = JSON.parse(t); } catch { arr = arr.split(/\r?\n/); } } else arr = arr.split(/\r?\n/); }
    if (!Array.isArray(arr)) arr = [];
    const clean = arr.map((x) => {
      if (x && typeof x === "object") return { label: String(x.label || "").slice(0, 60), url: String(x.url || "").trim() };
      const line = String(x || "").trim(); if (!line) return null;
      const parts = line.split("|").map((y) => y.trim());
      const url = parts.length > 1 ? parts[1] : parts[0];
      return { label: parts.length > 1 ? parts[0].slice(0, 60) : "", url };
    }).filter((x) => x && /^https?:\/\//i.test(x.url)).slice(0, 100);
    data.quickLinks = JSON.stringify(clean);
  }
  if ("lookupProxy" in b) { const pxy = String(b.lookupProxy || "").trim(); data.lookupProxy = pxy && /^https?:\/\//i.test(pxy) ? pxy : (pxy ? pxy : null); if (pxy && !/^(https?|socks\d?):\/\//i.test(pxy)) return NextResponse.json({ error: "Proxy must start with http://, https:// or socks5://" }, { status: 400 }); }
  const cur = await getSettings();
  if ((data.ipLock ?? cur.ipLock) && !(data.officeIps ?? cur.officeIps)) return NextResponse.json({ error: "Add at least one office IP before turning on the IP lock." }, { status: 400 });
  const out = await db.setting.update({ where: { id: "global" }, data });
  clearLockCache();
  if ("lockdown" in data) await db.huddle.updateMany({ where: { endedAt: null }, data: { endedAt: data.lockdown ? new Date() : undefined } }).catch(() => {});
  const { switchHash, ...safe } = out;
  return NextResponse.json({ ...safe, switchSet: !!switchHash });
}
