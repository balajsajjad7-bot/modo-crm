// Live web search through the AI key already set in Connectors (Groq "compound" or Gemini + Google
// Search grounding — both free tiers). Returns parsed JSON or null. Used only on Deep scan.
import { configFor } from "../connectors";
import { groqSearch, geminiSearch, pick } from "../deviceValue";

const memo = new Map();
export async function askWebJSON(prompt) {
  const hit = memo.get(prompt);
  if (hit && Date.now() - hit.at < 7 * 864e5) return hit.v;
  const cfg = (await configFor("ai")) || {};
  const key = cfg.apiKey || process.env.AI_API_KEY;
  const provider = cfg.provider || process.env.AI_PROVIDER || "gemini";
  if (!key) throw new Error("No AI key — add one in Connectors → AI provider");
  let text = "";
  if (provider === "groq") text = await groqSearch(key, prompt);
  else if (provider === "gemini") text = await geminiSearch(key, cfg.model || process.env.AI_MODEL || "gemini-2.5-flash", prompt);
  else throw new Error("Live web search needs Groq or Gemini as the AI provider");
  const v = pick(text);
  if (v) { if (memo.size > 300) memo.delete(memo.keys().next().value); memo.set(prompt, { at: Date.now(), v }); }
  return v;
}
