import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { TYPES, EVENTS, publicView, seal } from "@/lib/connectors";
import { clearHold } from "@/lib/vicidial";

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const list = await db.connector.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ types: TYPES, events: EVENTS, connectors: list.map(publicView) });
}

export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  clearHold();
  const b = await req.json();
  if (!TYPES[b.type]) return NextResponse.json({ error: "Unknown connector type." }, { status: 400 });
  const cfg = {}; for (const f of TYPES[b.type].fields) if (b.config?.[f]) cfg[f] = String(b.config[f]).trim();
  if ((cfg.url && !/^https?:\/\//.test(cfg.url))) return NextResponse.json({ error: "The URL must start with https:// (or http://)." }, { status: 400 });
  const c = await db.connector.create({ data: {
    type: b.type, name: String(b.name || TYPES[b.type].label).slice(0, 60), config: seal(cfg),
    events: (b.events || []).filter((e) => EVENTS[e]).join(","), enabled: true,
  } });
  return NextResponse.json(publicView(c));
}
