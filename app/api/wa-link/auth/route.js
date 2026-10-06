import { NextResponse } from "next/server";
import { relayAuth, loadAuth, saveAuth, wipeAuth } from "@/lib/walink";

export const maxDuration = 30;
// The relay loads / saves the linked WhatsApp login here (stored encrypted in Modo). Relay key required.
export async function GET(req) {
  if (!(await relayAuth(req))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  return new Response(await loadAuth(), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
export async function POST(req) {
  if (!(await relayAuth(req))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const text = await req.text();
  if (text.length > 8e6) return NextResponse.json({ error: "too big" }, { status: 413 });
  await saveAuth(text);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req) {
  if (!(await relayAuth(req))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  await wipeAuth();
  return NextResponse.json({ ok: true });
}
