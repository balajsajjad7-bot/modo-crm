import { NextResponse } from "next/server";
import { relayAuth, setStatus } from "@/lib/walink";
import { handleIncoming } from "@/lib/waInbox";

export const maxDuration = 60;
// From the relay: { type: "status", state, qr, me, error, pairCode } or { type: "message", from, name, text, kind, id }.
export async function POST(req) {
  if (!(await relayAuth(req))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.type === "status") {
    const patch = { state: String(b.state || "unknown"), qr: String(b.qr || "").slice(0, 2000), me: String(b.me || ""), error: String(b.error || "").slice(0, 300) };
    if (b.pairCode) { patch.pairCode = String(b.pairCode); patch.pairAt = new Date().toISOString(); }
    if (patch.state === "open") { patch.pairCode = ""; patch.linkedAt = new Date().toISOString(); }
    await setStatus(patch);
    return NextResponse.json({ ok: true });
  }
  if (b.type === "message") {
    try {
      const replies = await handleIncoming({ from: b.from, name: b.name, text: b.text, kind: b.kind, msgId: b.id, hidden: !!b.hiddenNumber, fromMe: !!b.fromMe, group: b.group || "", groupName: b.groupName || "" });
      return NextResponse.json({ replies });
    } catch (e) { return NextResponse.json({ replies: [], error: e.message }); }
  }
  return NextResponse.json({ error: "unknown event" }, { status: 400 });
}
