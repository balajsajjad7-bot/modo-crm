import { NextResponse } from "next/server";
import { requireAdminOnly } from "@/lib/auth";
import { sendToNumber, waReady } from "@/lib/waSend";

// Admin: send a WhatsApp message from the number linked in Modo. GET says whether one is linked.
export async function GET() {
  const { error } = await requireAdminOnly();
  if (error) return NextResponse.json({ ready: false });
  return NextResponse.json({ ready: !!(await waReady()) });
}
export async function POST(req) {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  if (!(await waReady())) return NextResponse.json({ error: "No WhatsApp is linked to Modo yet. Link one in Setup → WhatsApp.", notLinked: true }, { status: 400 });
  const r = await sendToNumber(b.to, b.text, { name: b.name, uid: session.uid });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
