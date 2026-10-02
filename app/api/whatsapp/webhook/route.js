import { NextResponse } from "next/server";
import { configFor } from "@/lib/connectors";
import { askAI } from "@/lib/ai";

export const maxDuration = 30;

// Meta calls this to verify the webhook (GET) and to deliver messages (POST).
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const mode = p.get("hub.mode"), token = p.get("hub.verify_token"), challenge = p.get("hub.challenge");
  const cfg = (await configFor("whatsapp")) || {};
  const verify = cfg.verifyToken || process.env.WA_VERIFY_TOKEN;
  if (mode === "subscribe" && token && verify && token === verify) return new Response(challenge || "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

async function reply(cfg, to, text) {
  await fetch(`https://graph.facebook.com/v20.0/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: String(text || "").slice(0, 4000) } }),
    signal: AbortSignal.timeout(12000),
  }).catch(() => {});
}

// Incoming WhatsApp message → Modo AI answers (using your trained knowledge) → reply on WhatsApp.
export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "text") return NextResponse.json({ ok: true }); // ignore delivery/status events & non-text
    const from = msg.from;
    const text = msg.text?.body || "";
    const cfg = (await configFor("whatsapp")) || {};
    if (!cfg.phoneId || !cfg.token || !from) return NextResponse.json({ ok: true });
    let answer = "Sorry, I couldn't process that right now. Please try again.";
    try {
      answer = await askAI(
        "You are Modo, a friendly assistant for a call-center team on WhatsApp. Answer helpfully and concisely using the company's approved info when it applies. If asked something you don't know, say so briefly.",
        text, { maxTokens: 500 }
      );
    } catch {}
    await reply(cfg, from, answer);
  } catch { /* never fail the webhook */ }
  return NextResponse.json({ ok: true });
}
