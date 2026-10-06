import { NextResponse } from "next/server";
import { relayAuth, takeOutbox, ackOutbox } from "@/lib/walink";

// The relay picks up messages Modo queued while it was asleep/offline, then confirms which were sent.
export async function GET(req) {
  if (!(await relayAuth(req))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  return NextResponse.json({ items: await takeOutbox() });
}
export async function POST(req) {
  if (!(await relayAuth(req))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  await ackOutbox([...(b.done || []), ...((b.failed || []).map((f) => f.id))]);
  return NextResponse.json({ ok: true });
}
