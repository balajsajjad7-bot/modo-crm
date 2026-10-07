import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { configFor } from "@/lib/connectors";

export const maxDuration = 60;
// Voice → text with Groq Whisper (free): the admin records a speech, or an agent records a practice pitch.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await req.formData();
  const audio = form.get("audio");
  if (!audio || typeof audio !== "object" || audio.size < 1500) return NextResponse.json({ error: "No sound was recorded — check the microphone." }, { status: 400 });
  if (audio.size > 24 * 1024 * 1024) return NextResponse.json({ error: "That recording is over 24 MB — split it into parts." }, { status: 400 });
  const cfg = (await configFor("ai")) || {};
  const key = (cfg.provider || process.env.AI_PROVIDER) === "groq" ? cfg.apiKey || process.env.AI_API_KEY : null;
  if (!key) return NextResponse.json({ error: "Voice needs the free Groq AI key: Admin → Connectors → AI provider → Groq. You can still type or paste the speech." }, { status: 400 });
  for (const model of ["whisper-large-v3-turbo", "whisper-large-v3"]) {
    const f = new FormData();
    f.set("file", audio, audio.name || "speech.webm"); f.set("model", model); f.set("language", "en"); f.set("response_format", "json"); f.set("temperature", "0");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: f });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return NextResponse.json({ text: String(d.text || "").trim() });
    if (!/model|not exist|decommission/i.test(d.error?.message || "")) return NextResponse.json({ error: "Groq Whisper: " + (d.error?.message || r.status) }, { status: 502 });
  }
  return NextResponse.json({ error: "Couldn't turn the recording into text." }, { status: 502 });
}
