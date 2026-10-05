import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { lookupDeviceValue, deviceName } from "@/lib/deviceValue";
import { friendlyError } from "@/lib/errors";

export const maxDuration = 60;
const FIELDS = { id: true, deviceValue: true, deviceValueUsed: true, deviceValueSrc: true, deviceValueAt: true };
const WEEK = 7 * 24 * 3600 * 1000;

// Look up what each sale's device is worth today (searches the web through the AI connector).
// { ids: [...] } prices up to 4 sales per call; { id, refresh: true } re-checks one; { id, value } sets it by hand.
export async function POST(req) {
  const { error } = await requireManager("sales");
  if (error) return error;
  const b = await req.json().catch(() => ({}));

  if (b.id && b.value !== undefined) {
    const v = b.value === "" || b.value == null ? null : Number(b.value);
    if (v != null && (!isFinite(v) || v < 0)) return NextResponse.json({ error: "Enter a price in dollars." }, { status: 400 });
    const s = await db.sale.update({ where: { id: String(b.id) }, data: { deviceValue: v, deviceValueSrc: v == null ? null : "Set by admin", deviceValueAt: new Date() }, select: FIELDS });
    return NextResponse.json({ sales: [s] });
  }

  const ids = (b.ids || (b.id ? [b.id] : [])).map(String).slice(0, 4);
  if (!ids.length) return NextResponse.json({ error: "Which sales?" }, { status: 400 });
  const sales = await db.sale.findMany({ where: { id: { in: ids } }, select: { id: true, device: true, storage: true, deviceValue: true } });
  const out = [], errors = [];
  const seen = {}; // same device in this batch → one search
  for (const s of sales) {
    const name = deviceName(s);
    if (!name) continue;
    if (s.deviceValue != null && !b.refresh) continue;
    try {
      let price = seen[name.toLowerCase()];
      // Another sale with the same device priced in the last week → reuse it (saves AI calls).
      if (!price && !b.refresh) {
        const same = await db.sale.findFirst({ where: { device: s.device, storage: s.storage, deviceValue: { not: null }, deviceValueAt: { gte: new Date(Date.now() - WEEK) }, NOT: { deviceValueSrc: "Set by admin" } }, select: { deviceValue: true, deviceValueUsed: true, deviceValueSrc: true } });
        if (same) price = { value: same.deviceValue, used: same.deviceValueUsed, source: same.deviceValueSrc };
      }
      if (!price) price = await lookupDeviceValue(name);
      seen[name.toLowerCase()] = price;
      out.push(await db.sale.update({ where: { id: s.id }, data: { deviceValue: price.value, deviceValueUsed: price.used ?? null, deviceValueSrc: String(price.source || "web").slice(0, 80), deviceValueAt: new Date() }, select: FIELDS }));
    } catch (e) { errors.push({ id: s.id, error: e.message }); }
  }
  if (!out.length && errors.length) return NextResponse.json({ error: friendlyError(new Error(errors[0].error)), errors }, { status: 502 });
  return NextResponse.json({ sales: out, errors });
}
