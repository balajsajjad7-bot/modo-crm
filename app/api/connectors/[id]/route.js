import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { TYPES, EVENTS, parse, publicView, test, seal } from "@/lib/connectors";

// Update: { name?, enabled?, events?, config? }  — blank secret fields keep the saved value
export async function PATCH(req, { params }) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const c = await db.connector.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const b = await req.json();
  const data = {};
  if ("name" in b) data.name = String(b.name).slice(0, 60);
  if ("enabled" in b) data.enabled = !!b.enabled;
  if ("events" in b) data.events = (b.events || []).filter((e) => EVENTS[e]).join(",");
  if (b.config) {
    const cfg = parse(c);
    for (const f of TYPES[c.type].fields) if (b.config[f] !== undefined && b.config[f] !== "" && !String(b.config[f]).startsWith("••••")) cfg[f] = String(b.config[f]).trim();
    data.config = seal(cfg);
  }
  const u = await db.connector.update({ where: { id: c.id }, data });
  return NextResponse.json(publicView(u));
}

// Send a test event / check the credentials
export async function POST(req, { params }) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const c = await db.connector.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const status = await test(c);
  await db.connector.update({ where: { id: c.id }, data: { lastStatus: "test: " + status, lastAt: new Date() } });
  return NextResponse.json({ status });
}

export async function DELETE(req, { params }) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  await db.connector.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
