import { configFor } from "./connectors";
import { askAI } from "./ai";

// Looks up what a device is worth right now by searching the web, using the AI key already set in
// Admin → Connectors. Groq → "compound" models (built-in web search). Gemini → Google Search grounding.
// Any other provider (or if live search fails) → the AI's own estimate, clearly marked as an estimate.

const ASK = (name) => `Look up the current price in the United States of this phone/device: "${name}".
Use today's prices from big US retailers or carriers (Apple, Samsung, Best Buy, Amazon, Verizon, AT&T) and resale sites (Swappa, eBay sold, Back Market).
Reply with JSON only, no other words:
{"value": <current NEW retail price in USD, a number>, "used": <typical USED resale value in USD, a number or null>, "source": "<main website you used>", "note": "<max 12 words, e.g. which model/storage you matched>"}`;

function pick(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "");
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
}
const money = (n) => { const x = Number(String(n ?? "").replace(/[^0-9.]/g, "")); return isFinite(x) && x > 0 && x < 20000 ? Math.round(x * 100) / 100 : null; };
function clean(d, live) {
  if (!d) return null;
  const value = money(d.value);
  if (!value) return null;
  return { value, used: money(d.used), source: String(d.source || (live ? "web" : "AI estimate")).slice(0, 80), note: String(d.note || "").slice(0, 120), live };
}

async function groqSearch(key, prompt) {
  for (const model of ["groq/compound-mini", "groq/compound"]) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return d.choices?.[0]?.message?.content || "";
    if (r.status === 429) await new Promise((ok) => setTimeout(ok, 2500));
  }
  return "";
}
async function geminiSearch(key, model, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
  });
  const d = await r.json().catch(() => ({}));
  return r.ok ? d.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "" : "";
}

export function deviceName(s) {
  return [s.device, s.storage].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export async function lookupDeviceValue(name) {
  if (!name) throw new Error("This sale has no device.");
  const cfg = (await configFor("ai")) || {};
  const key = cfg.apiKey || process.env.AI_API_KEY;
  const provider = cfg.provider || process.env.AI_PROVIDER || "gemini";
  const prompt = ASK(name);
  let live = null;
  try {
    if (key && provider === "groq") live = clean(pick(await groqSearch(key, prompt)), true);
    else if (key && provider === "gemini") live = clean(pick(await geminiSearch(key, cfg.model || process.env.AI_MODEL || "gemini-2.5-flash", prompt)), true);
  } catch {}
  if (live) return live;
  // No live search available: fall back to the AI's own knowledge (marked as an estimate).
  const est = await askAI("You price consumer electronics in the US. Reply with JSON only.", prompt, { json: true, knowledge: false, maxTokens: 300 });
  const out = clean(est, false);
  if (!out) throw new Error("Couldn't find a price for " + name + ".");
  return { ...out, source: "AI estimate", note: out.note || "No live web search on this AI provider" };
}
