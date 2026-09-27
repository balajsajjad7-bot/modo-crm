import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { configFor } from "@/lib/connectors";

// Customer's side of the call: a few seconds of the dialer tab's audio → Groq Whisper (free tier) → "C: …" line.
export async function POST(req) {
  const { session, error } = await requireRole("AGENT");
  if (error) return error;
  const form = await req.formData();
  const id = String(form.get("sessionId") || ""); const audio = form.get("audio");
  const s = id ? await db.callSession.findFirst({ where: { id, userId: session.uid } }) : null;
  if (!s) return NextResponse.json({ error: "Start the call first." }, { status: 400 });
  if (!audio || typeof audio !== "object" || audio.size < 2000) return NextResponse.json({ text: "" });
  const cfg = (await configFor("ai")) || {};
  const key = (cfg.provider || process.env.AI_PROVIDER) === "groq" ? cfg.apiKey || process.env.AI_API_KEY : null;
  if (!key) return NextResponse.json({ error: "Hearing the customer needs a Groq AI key (free). Admin → Connectors → AI provider → Groq." }, { status: 400 });
  let text = "";
  for (const model of ["whisper-large-v3-turbo", "whisper-large-v3"]) {
    const f = new FormData();
    f.set("file", audio, "chunk.webm"); f.set("model", model); f.set("language", "en"); f.set("response_format", "json"); f.set("temperature", "0");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: f });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { text = (d.text || "").trim(); break; }
    if (!/model|not exist|decommission/i.test(d.error?.message || "")) return NextResponse.json({ error: "Groq Whisper: " + (d.error?.message || r.status) }, { status: 502 });
  }
  // Whisper sometimes "hears" these in silence
  if (!text || /^(thank you\.?|thanks for watching\.?|you|\.+|bye\.?)$/i.test(text)) return NextResponse.json({ text: "" });
  await db.callSession.update({ where: { id: s.id }, data: { transcript: (s.transcript + "\nC: " + text).trim().slice(-20000), customerSide: true } });
  return NextResponse.json({ text });
}
