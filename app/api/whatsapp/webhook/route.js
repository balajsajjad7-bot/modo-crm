import { NextResponse } from "next/server";
import crypto from "crypto";
import { configFor } from "@/lib/connectors";
import { digits, waConfig, sendWA } from "@/lib/whatsapp";
import { handleIncoming } from "@/lib/waInbox";

export const maxDuration = 60;

// Meta calls this to verify the webhook (GET) and to deliver messages (POST).
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const mode = p.get("hub.mode"), token = p.get("hub.verify_token"), challenge = p.get("hub.challenge");
  const cfg = (await configFor("whatsapp")) || {};
  const verify = cfg.verifyToken || process.env.WA_VERIFY_TOKEN;
  if (mode === "subscribe" && token && verify && token === verify) return new Response(challenge || "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

// Incoming WhatsApp message:
//  • from an admin number → the Modo bot answers (sales, online, late, callbacks, coach, tracking, AI…)
//  • from anyone else → a customer chat in Modo (Chat → WhatsApp conversations) that admins and added agents
//    can read and answer; optionally Modo AI replies first (Connectors → WhatsApp → AI auto-reply).
export async function POST(req) {
  const raw = await req.text().catch(() => "");
  let body = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  try {
    // With the App secret set, only messages genuinely signed by Meta are accepted (stops fake admin commands).
    // Without the App secret nothing is accepted: anyone could otherwise post fake "admin" commands here.
    const sec = (await waConfig())?.appSecret;
    if (!sec) return NextResponse.json({ ok: true, ignored: "Set the App secret in Connectors → WhatsApp." });
    {
      const sig = req.headers.get("x-hub-signature-256") || "";
      const want = "sha256=" + crypto.createHmac("sha256", sec).update(raw).digest("hex");
      if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return NextResponse.json({ ok: true });
    }
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return NextResponse.json({ ok: true }); // delivery/status events
    const from = digits(msg.from);
    const cfg = await waConfig();
    if (!cfg || !from) return NextResponse.json({ ok: true });
    const text = msg.type === "text" ? (msg.text?.body || "") : msg.type === "button" ? (msg.button?.text || "") : msg.type === "interactive" ? (msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "") : "";
    const replies = await handleIncoming({ from, name: value?.contacts?.[0]?.profile?.name || "", text, kind: msg.type, msgId: msg.id });
    for (const t of replies) await sendWA(from, t, cfg);
  } catch { /* never fail the webhook */ }
  return NextResponse.json({ ok: true });
}
