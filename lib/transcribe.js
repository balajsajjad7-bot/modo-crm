// Voice → text with Groq Whisper (free). Shared by campaign speeches, pitch practice and the hiring English test.
import { configFor } from "./connectors";

export async function transcribe(audio) {
  if (!audio || typeof audio !== "object" || audio.size < 1500) throw Object.assign(new Error("No sound was recorded — check the microphone."), { status: 400 });
  if (audio.size > 24 * 1024 * 1024) throw Object.assign(new Error("That recording is over 24 MB — split it into parts."), { status: 400 });
  const cfg = (await configFor("ai")) || {};
  const key = (cfg.provider || process.env.AI_PROVIDER) === "groq" ? cfg.apiKey || process.env.AI_API_KEY : process.env.GROQ_API_KEY || null;
  if (!key) throw Object.assign(new Error("Voice needs the free Groq AI key: Admin → Connectors → AI provider → Groq."), { status: 400, noKey: true });
  for (const model of ["whisper-large-v3-turbo", "whisper-large-v3"]) {
    const f = new FormData();
    f.set("file", audio, audio.name || "speech.webm"); f.set("model", model); f.set("language", "en"); f.set("response_format", "json"); f.set("temperature", "0");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: f });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return String(d.text || "").trim();
    if (!/model|not exist|decommission/i.test(d.error?.message || "")) throw Object.assign(new Error("Groq Whisper: " + (d.error?.message || r.status)), { status: 502 });
  }
  throw Object.assign(new Error("Couldn't turn the recording into text."), { status: 502 });
}
