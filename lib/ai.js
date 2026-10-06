import { configFor } from "./connectors";

// Groq retires models often (Llama was shut down in Aug 2026). If the saved model is gone,
// we ask Groq which models this key can use, switch to the best one and remember it.
const GROQ_DEFAULT = "openai/gpt-oss-120b";
const GROQ_PREFER = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const groqSwap = {};
export let lastModel = null;

export async function groqModels(key) {
  const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `Groq models request failed (${r.status})`);
  return (d.data || []).filter((m) => m.active !== false && !/whisper|tts|orpheus|guard|safeguard|compound|playai|distil/i.test(m.id)).map((m) => m.id);
}
function pickGroq(ids) {
  return GROQ_PREFER.find((x) => ids.includes(x)) || ids.find((x) => /gpt-oss-120b/.test(x)) || ids.find((x) => /gpt-oss/.test(x)) || ids.find((x) => /qwen|llama|kimi|mistral/i.test(x)) || ids[0];
}
async function groqChat({ key, model, system, turns, json, maxTokens }, tried = {}) {
  const reasoning = /gpt-oss|qwen3/i.test(model);
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0.4, max_completion_tokens: maxTokens + (reasoning ? 1500 : 0),
      ...(reasoning && /gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {}),
      messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: t.content }))],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.error?.message || `Groq request failed (${r.status})`;
    // Free tier busy: wait a moment and try once more
    if (r.status === 429 && !tried.rate) { const w = Math.min(6, Number(r.headers.get("retry-after")) || 2); await new Promise((ok) => setTimeout(ok, w * 1000)); return groqChat({ key, model, system, turns, json, maxTokens }, { ...tried, rate: 1 }); }
    if (r.status === 429) throw new Error("Groq's free limit is busy right now. Try again in a minute.");
    // JSON mode sometimes rejects a good answer ("json_validate_failed"): ask again without strict JSON mode
    if (json && !tried.json && /json_validate|response_format|failed to generate json/i.test(msg)) return groqChat({ key, model, system: system + "\nReply with valid JSON only.", turns, json: false, maxTokens }, { ...tried, json: 1 });
    if (!tried.model && (r.status === 404 || /model.*(not exist|decommission|not found|access)/i.test(msg))) {
      const ids = await groqModels(key);
      const alt = pickGroq(ids);
      if (!alt || alt === model) throw new Error(msg + (ids.length ? ` Models your key can use: ${ids.slice(0, 8).join(", ")}` : ""));
      groqSwap[model] = alt;
      return groqChat({ key, model: alt, system, turns, json, maxTokens }, { ...tried, model: 1 });
    }
    throw new Error(msg);
  }
  return { text: (d.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(), model };
}

// OpenAI-compatible providers (same /chat/completions shape, different base URL + default model).
const OAI = {
  openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  openrouter: { base: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  mistral: { base: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  together: { base: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  xai: { base: "https://api.x.ai/v1", model: "grok-2-latest" },
  ollama: { base: "http://localhost:11434/v1", model: "llama3.1", noKey: true },
  custom: { base: "", model: "" },
};
async function openaiChat({ base, key, model, system, turns, json, maxTokens }) {
  const r = await fetch(base.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model, temperature: 0.4, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: t.content }))],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || d.error || `AI request failed (${r.status})`);
  return { text: (d.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(), model };
}

// One place to call the AI. Uses the AI connector if set up in Admin → Connectors, otherwise .env.
// `input` is a string, or a list of {role: "user"|"assistant", content} for a conversation.
// "Train Modo AI": the company knowledge admin writes is added to every AI request (cached for 30 seconds).
// Built-in knowledge about the companies/partners this call center works with, so the AI can
// speak to carriers, bill pay, shipping and order tracking even before the admin types anything.
const PARTNER_KNOWLEDGE = `Companies and partners we deal with (know their general services, how customers pay bills, and how orders/packages are tracked):
- Phone carriers: Verizon, AT&T, T-Mobile, Cricket Wireless, Metro by T-Mobile, Boost Mobile, Mint Mobile, Straight Talk, Visible, US Cellular, Xfinity Mobile, Spectrum Mobile. Customers can sign in, pay their bill, and check order status on each carrier's site.
- Cable / Internet / TV: Xfinity (Comcast), Spectrum, Cox, CenturyLink, Frontier, Optimum, DISH, DIRECTV — bill pay and account management online.
- Shipping carriers: UPS, FedEx, USPS, DHL. A package can be: label created / pre-shipment, picked up or dropped off at a store (e.g. a UPS Store), in transit, out for delivery, delivered, or an exception. "Dropped at the UPS store" means the customer handed the package to a UPS location and it's awaiting the first carrier scan.
- Money transfer: Western Union, MoneyGram — send and track transfers.
- Retail / marketplaces: Amazon, eBay, Walmart — order history and tracking.
Explain these plainly and never invent account numbers, prices, or tracking results.`;

let kCache = { at: 0, text: "" };
export async function knowledgeBlock() {
  if (Date.now() - kCache.at < 30000) return kCache.text;
  let text = "";
  try {
    const { getSettings } = await import("./settings");
    const k = JSON.parse((await getSettings()).aiKnowledge || "{}");
    if (k.enabled !== false) {
      const parts = [];
      if (k.company) parts.push("About the company and products:\n" + k.company);
      if (k.products) parts.push("Products and plans we sell (use exactly these):\n" + k.products);
      if (k.prices) parts.push("Prices, discounts and offers (use exactly these, never invent):\n" + k.prices);
      if (k.script) parts.push("Our call script / the way we pitch:\n" + k.script);
      if (Array.isArray(k.objections) && k.objections.length) parts.push("Approved answers to objections:\n" + k.objections.filter((o) => o.q && o.a).map((o) => `- If the customer says "${o.q}": ${o.a}`).join("\n"));
      if (k.rules) parts.push("Rules (always follow):\n" + k.rules);
      if (k.words) parts.push("Words and names we use:\n" + k.words);
      // Lessons posted in #modo-training (call guides, compliance) — agents are trained on these, so the AI coaches the same way.
      try { const { lessonsForAI } = await import("./training"); const t = await lessonsForAI(); if (t) parts.push("Training lessons agents must follow (from #modo-training):\n" + t.slice(0, 6000)); } catch {}
      // Built-in grounding about the partner companies the team deals with (carriers, shipping, bill pay, retail).
      if (k.partners !== false) parts.push(PARTNER_KNOWLEDGE);
      if (parts.length) text = "\n\n=== COMPANY KNOWLEDGE (from admin; this overrides general knowledge) ===\n" + parts.join("\n\n").slice(0, 14000);
    }
  } catch {}
  kCache = { at: Date.now(), text };
  return text;
}
export const clearKnowledgeCache = () => { kCache.at = 0; };

export async function askAI(system, input, { json = false, override = null, maxTokens = 1000, knowledge = true } = {}) {
  if (knowledge) system = system + (await knowledgeBlock());
  const cfg = override || (await configFor("ai")) || {};
  const key = cfg.apiKey || process.env.AI_API_KEY;
  const provider = cfg.provider || process.env.AI_PROVIDER || "gemini";
  let model = cfg.model || process.env.AI_MODEL || (provider === "anthropic" ? "claude-sonnet-4-5" : provider === "groq" ? GROQ_DEFAULT : OAI[provider] ? OAI[provider].model : "gemini-2.5-flash");
  if (provider === "groq" && groqSwap[model]) model = groqSwap[model];
  const needsKey = !(OAI[provider] && OAI[provider].noKey);
  if (!key && needsKey) throw new Error("No AI key yet. Add one in Admin → Connectors → AI provider.");
  const turns = typeof input === "string" ? [{ role: "user", content: input }] : input;
  let text = "";
  if (provider === "groq") {
    const res = await groqChat({ key, model, system, turns, json, maxTokens });
    text = res.text; lastModel = res.model;
  } else if (OAI[provider]) {
    const base = cfg.baseUrl || OAI[provider].base;
    if (!base) throw new Error("Set the Base URL for this provider in Admin → Connectors.");
    const res = await openaiChat({ base, key, model, system, turns, json, maxTokens });
    text = res.text; lastModel = res.model;
  } else if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: turns.map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: t.content })) }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || "AI request failed");
    text = d.content?.map((c) => c.text || "").join("") || "";
  } else {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
        generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || "AI request failed");
    text = d.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  }
  if (!json) return text.trim();
  return parseJson(text);
}

function parseJson(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const i = clean.indexOf("{"), j = clean.lastIndexOf("}"); // model added words around the JSON
  if (i >= 0 && j > i) { try { return JSON.parse(clean.slice(i, j + 1)); } catch {} }
  return null;
}

// Read an uploaded file (PDF or image) with a vision model and return parsed JSON.
// mime: "application/pdf" | "image/png" | "image/jpeg" …   dataB64: base64 (no data: prefix)
export async function askFile({ mime, dataB64, system, prompt, json = true, maxTokens = 1200 }) {
  const cfg = (await configFor("ai")) || {};
  const key = cfg.apiKey || process.env.AI_API_KEY;
  const provider = cfg.provider || process.env.AI_PROVIDER || "gemini";
  const isPdf = /pdf/i.test(mime || "");
  if (!key && !(OAI[provider] && OAI[provider].noKey)) throw new Error("No AI key yet. Add one in Admin → Connectors → AI provider.");
  let text = "";

  if (provider === "gemini" || (!OAI[provider] && provider !== "anthropic" && provider !== "groq")) {
    const model = cfg.model || process.env.AI_MODEL || "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: dataB64 } }, { text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) } }),
    });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || "AI couldn't read the file.");
    text = d.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  } else if (provider === "anthropic") {
    const model = cfg.model || process.env.AI_MODEL || "claude-sonnet-4-5";
    const block = isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: dataB64 } }
                        : { type: "image", source: { type: "base64", media_type: mime, data: dataB64 } };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }] }),
    });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || "AI couldn't read the file.");
    text = d.content?.map((c) => c.text || "").join("") || "";
  } else {
    // OpenAI-compatible (openai, openrouter, together, xai, groq, custom): images only.
    if (isPdf) throw new Error("This AI provider can't read PDFs directly. Use a Google Gemini or Anthropic key in Connectors, or upload a photo of the bill instead.");
    const base = cfg.baseUrl || (OAI[provider] ? OAI[provider].base : "https://api.openai.com/v1");
    const model = cfg.model || process.env.AI_MODEL || (provider === "groq" ? "meta-llama/llama-4-scout-17b-16e-instruct" : OAI[provider]?.model || "gpt-4o-mini");
    const r = await fetch(base.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, max_tokens: maxTokens, ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mime};base64,${dataB64}` } }] }] }),
    });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message || d.error || "AI couldn't read the image.");
    text = d.choices?.[0]?.message?.content || "";
  }
  return json ? parseJson(text) : String(text).trim();
}
