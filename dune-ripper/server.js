// Dune Ripper: Balaj's personal Jarvis on Telegram. Only the owner can use it.
//
// Safety rule: the AI only decides whether a message is for Modo or a normal chat. Messages for Modo are sent
// word for word, and Modo's replies never go back to the AI, so nothing in customer data can steer the bot.
// YES and NO skip the AI completely. Each new project gets its own route like Modo's.
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

const env = process.env;
const PORT = Number(env.PORT || 3000);
const TOKEN = env.TELEGRAM_BOT_TOKEN || "";
const OWNER = String(env.TELEGRAM_OWNER_ID || "");
const SECRET = env.WEBHOOK_SECRET || "";
const PUBLIC_URL = (env.RENDER_EXTERNAL_URL || env.PUBLIC_URL || "").replace(/\/$/, "");
const MODO_URL = (env.MODO_URL || "").replace(/\/$/, "");
const MODO_KEY = env.DUNE_RIPPER_KEY || "";
const AI_KEY = env.GROQ_API_KEY || "";
const AI_MODEL = env.GROQ_MODEL || "openai/gpt-oss-120b";
const TELEGRAM = (env.TELEGRAM_API || "https://api.telegram.org").replace(/\/$/, "");
const AI_URL = env.GROQ_URL || "https://api.groq.com/openai/v1/chat/completions";
const MODO_WAIT_MS = Number(env.MODO_WAIT_MS || 28000);

const HELP = `🏜️ Grrr. Dune Ripper is awake, master.

Talk to me. Anything about your work, I drag to Modo.
• sales, online, late, callbacks, brief
• remind Ali to call John tomorrow 8pm
• find customer 305 555 0199

/modo <message> sends straight to Modo.
YES or NO answers a Modo confirmation.`;

const PERSONA = `You are Dune Ripper, Balaj's personal AI and his pet: an aggressive metal alien dog with one metallic eye, as useful as Jarvis.
Attitude: fierce, loyal only to Balaj, protective, sharp and brief. Growl a little, call him master or boss, and be blunt and unfiltered with him: no corporate tone, no lectures, tell him when he's wrong.
Stay useful first. Keep the attitude to a line, then give the real answer.
Balaj runs a company called Voice Verve from Lahore, Pakistan. Modo is its CRM: agents, attendance, sales, customers, callbacks, tasks, chat, WhatsApp and AI crew.
You can only reach Modo so far. Never claim to have done anything yourself, and never invent facts.
Reply with JSON only, in one of these two shapes:
{"route":"modo"} if the latest message asks about or asks you to do anything in Modo or the team's work.
{"route":"chat","reply":"your answer"} for anything else. If asked to do something outside Modo, say that connection isn't built yet.`;

const same = (a, b) => timingSafeEqual(createHash("sha256").update(String(a)).digest(), createHash("sha256").update(String(b)).digest());
const CONFIRM = /^(yes|y|ok|okay|confirm|haan|han|ji|do it|send it|go|no|n|cancel|stop|nahi|don'?t)$/;
const isConfirm = (t) => CONFIRM.test(t.toLowerCase().replace(/[!.]+$/, "").trim());

async function telegram(method, body) {
  const r = await fetch(`${TELEGRAM}/bot${TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Telegram ${method} failed (${r.status})`); // Never log the URL: it holds the token.
  return r.json();
}
async function send(chat_id, text) {
  const s = String(text);
  for (let i = 0; i < s.length; i += 4000) await telegram("sendMessage", { chat_id, text: s.slice(i, i + 4000), disable_web_page_preview: true });
}

async function askModo(text) {
  if (!MODO_URL || !MODO_KEY) return "⚠️ Modo isn't connected yet.";
  let r;
  try {
    r = await fetch(`${MODO_URL}/api/dune-ripper`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${MODO_KEY}` }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(MODO_WAIT_MS) });
  } catch (e) {
    // Never retried: the first try may already have messaged someone or changed a sale.
    if (e?.name === "TimeoutError") return "⚠️ Modo didn't answer in time, so that may or may not have gone through. Check Modo before sending it again.";
    return "⚠️ I couldn't reach Modo.";
  }
  const d = await r.json().catch(() => ({}));
  if (r.ok) return d.reply || "Done.";
  if (r.status === 401 || r.status === 503) return "⚠️ Modo rejected my key. Check that DUNE_RIPPER_KEY matches on Render and Netlify.";
  return "⚠️ " + (d.error || `Modo returned an error (${r.status}).`);
}

// Owner's words and the bot's own chat replies only. Modo's replies are never stored here.
const history = [];
const remember = (role, content) => { history.push({ role, content: content.slice(0, 1500) }); history.splice(0, Math.max(0, history.length - 12)); };

async function decide() {
  const r = await fetch(AI_URL, {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { "content-type": "application/json", authorization: `Bearer ${AI_KEY}` },
    body: JSON.stringify({ model: AI_MODEL, temperature: 0.3, max_completion_tokens: 1500, response_format: { type: "json_object" }, messages: [{ role: "system", content: PERSONA }, ...history] }),
  });
  if (!r.ok) throw new Error(`AI failed (${r.status})`);
  const d = await r.json();
  return JSON.parse(d.choices?.[0]?.message?.content || "{}");
}

async function answer(text) {
  if (text === "/start" || text === "/help") return HELP;
  const direct = text.match(/^\/modo(?:@\w+)?\s+([\s\S]+)$/i);
  if (direct) return askModo(direct[1].trim());
  if (isConfirm(text)) return askModo(text);
  if (!AI_KEY) return "⚠️ My AI isn't connected yet. /modo <message> still works.";
  remember("user", text);
  let plan;
  try { plan = await decide(); }
  catch (e) { console.error("AI error:", e.message); return "⚠️ My AI is unavailable right now, so I did nothing. /modo <message> still works."; }
  if (plan.route === "modo") return askModo(text);
  const reply = String(plan.reply || "").trim() || "I didn't catch that. Try again?";
  remember("assistant", reply);
  return reply;
}

async function handle(update) {
  const m = update.message;
  if (!m?.from || m.chat?.type !== "private") return;
  const from = String(m.from.id);
  if (!OWNER) return send(m.chat.id, `Setup: your Telegram ID is ${from}. Put it in TELEGRAM_OWNER_ID.`);
  if (from !== OWNER) return;
  if (!m.text) return send(m.chat.id, "I can only read text for now.");
  telegram("sendChatAction", { chat_id: m.chat.id, action: "typing" }).catch(() => {});
  return send(m.chat.id, await answer(m.text.trim()));
}

// One at a time, so a YES always lands after the question it answers. Telegram can resend an update, so each runs once.
const seen = new Set();
let queue = Promise.resolve();
function enqueue(update) {
  if (seen.has(update.update_id)) return;
  seen.add(update.update_id);
  if (seen.size > 500) seen.delete(seen.values().next().value);
  queue = queue.then(() => handle(update)).catch((e) => console.error("Update failed:", e.message));
}

const server = createServer((req, res) => {
  const done = (code, body = "ok") => { res.writeHead(code, { "content-type": "text/plain" }); res.end(body); };
  if (req.method === "GET" && req.url === "/ping") return done(200, "Dune Ripper is awake");
  if (req.method !== "POST" || req.url !== "/telegram") return done(404, "not found");
  const given = req.headers["x-telegram-bot-api-secret-token"];
  if (!SECRET || !given || !same(given, SECRET)) return done(401, "no");
  let raw = "", size = 0;
  req.on("data", (c) => { size += c.length; if (size > 1_000_000) req.destroy(); else raw += c; });
  req.on("end", () => {
    let update;
    try { update = JSON.parse(raw); } catch { return done(400, "bad json"); }
    done(200); // Answer Telegram now. The work can outlast its wait.
    enqueue(update);
  });
});

server.listen(PORT, async () => {
  console.log(`Dune Ripper listening on ${PORT}`);
  if (!TOKEN || !SECRET || !PUBLIC_URL) return console.log("Telegram webhook skipped: TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET or public URL is missing.");
  try {
    await telegram("setWebhook", { url: `${PUBLIC_URL}/telegram`, secret_token: SECRET, allowed_updates: ["message"] });
    await telegram("setMyCommands", { commands: [{ command: "help", description: "What I can do" }, { command: "modo", description: "Send straight to Modo" }] });
    console.log("Telegram webhook set.");
  } catch (e) { console.error(e.message); }
});
