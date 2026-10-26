import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { permsFor } from "@/lib/perms";
import { runIntel, INTEL_TYPES } from "@/lib/intel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Keeps everyone inside the free API quotas: per person, 40 scans / 10 min (12 deep).
const hits = new Map();
function limited(uid, deep) {
  const now = Date.now(), win = 600e3;
  const h = (hits.get(uid) || []).filter((x) => now - x.t < win);
  const max = deep ? 12 : 40;
  if (h.filter((x) => !deep || x.deep).length >= max) return true;
  h.push({ t: now, deep }); hits.set(uid, h);
  return false;
}
const clip = (v, n = 200) => (v == null ? "" : String(v).slice(0, n).trim());

// GET → which Customer-intel connectors are set up (for the "connected" chips).
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const list = await db.connector.findMany({ where: { type: { in: INTEL_TYPES }, enabled: true }, select: { type: true } });
  return NextResponse.json({ connected: Object.fromEntries(INTEL_TYPES.map((t) => [t, list.some((c) => c.type === t)])) });
}

// POST { phone, address, zip, email, imei, device } or { contactId } or { saleId }, + deep: true for AI web search
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const P = await permsFor(s);
  const admin = s.role === "ADMIN" || s.role === "SUPERVISOR";
  if (!admin && P.customerIntel === false) return NextResponse.json({ error: "Admin has turned Customer 360 off for agents." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const deep = !!b.deep;
  let input = { phone: clip(b.phone, 30), address: clip(b.address, 250), zip: clip(b.zip, 10), email: clip(b.email, 120), imei: clip(b.imei, 20), device: clip(b.device, 80), name: clip(b.name, 80) };

  if (b.contactId) {
    const c = await db.contact.findUnique({ where: { id: String(b.contactId) } });
    if (!c || (!admin && c.ownerId !== s.uid)) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    if (!admin && !P.seeContactInfo) return NextResponse.json({ error: "Admin has hidden customers' contact details from agents." }, { status: 403 });
    input = { ...input, name: c.name, phone: input.phone || c.phone || "", email: input.email || c.email || "", address: input.address || [c.address, c.city].filter(Boolean).join(", ") };
  }
  if (b.saleId) {
    if (s.role !== "ADMIN") return NextResponse.json({ error: "Sales are admin-only." }, { status: 403 });
    const x = await db.sale.findUnique({ where: { id: String(b.saleId) } });
    if (!x) return NextResponse.json({ error: "Sale not found." }, { status: 404 });
    input = { ...input, name: x.customer || "", phone: input.phone || x.phone || "", email: input.email || x.email || "", address: input.address || x.address || "", zip: input.zip || x.zip || "", device: input.device || [x.device, x.storage].filter(Boolean).join(" ") };
  }
  if (!input.phone && !input.address && !input.zip && !input.email && !input.imei && !input.device) return NextResponse.json({ error: "Type a phone, address, ZIP, email or IMEI." }, { status: 400 });
  if (limited(s.uid, deep)) return NextResponse.json({ error: deep ? "Deep scans are limited to 12 per 10 minutes to stay free. Try a normal scan." : "Slow down a little — 40 scans per 10 minutes." }, { status: 429 });
  try {
    const out = await runIntel(input, s, { deep });
    return NextResponse.json({ ...out, input: { name: input.name, phone: input.phone, address: input.address, zip: input.zip, email: input.email, imei: input.imei, device: input.device } });
  } catch (e) {
    return NextResponse.json({ error: "Scan failed: " + (e?.message || e) }, { status: 500 });
  }
}
