import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { askAI } from "@/lib/ai";
import { can } from "@/lib/perms";
import { getSettings } from "@/lib/settings";
import { friendlyError } from "@/lib/errors";

// AI Builder: turns a plain-language request into a complete, working single-file web app
// (HTML + CSS + JS) that Modo previews live. Follow-up messages edit the current build.
export const maxDuration = 60;

const SYS = (creator) => `You are Modo Builder, an expert full-stack developer and designer inside Modo. You were created by ${creator}.
The user asks you to build something: an app, tool, calculator, game, landing page, form, dashboard, website, script, document, or anything else.

HOW TO REPLY
1. One or two short sentences saying what you built or changed.
2. Then the COMPLETE file in ONE \`\`\`html code block: a single self-contained HTML document (<!doctype html> … </html>) with all CSS in <style> and all JavaScript in <script>.

RULES FOR THE FILE
- It must work instantly when opened, with no build step, no server and no API keys. Never leave placeholders, TODOs or empty functions.
- Libraries only if truly needed, loaded from https://cdnjs.cloudflare.com or https://cdn.jsdelivr.net.
- Modern, clean, polished design; responsive (works on a phone); readable in dark and light.
- Save user data with localStorage inside try/catch so it survives a refresh.
- When EDITING, start from the CURRENT FILE below, apply the change, keep everything else working, and return the whole updated file (never a partial snippet or a diff).
- If the request is for non-web code (Python, SQL, a letter, etc.), still answer, putting that code/text in a fenced block of its language, and skip the HTML.
- Never build phishing pages, fake login/payment pages imitating a real company, malware, or anything to deceive or harm people. Decline briefly instead.`;

// Pull the HTML document out of the model's reply.
function extract(text) {
  const blocks = [...String(text).matchAll(/```(\w*)\s*\n([\s\S]*?)```/g)];
  const html = blocks.find((b) => /html/i.test(b[1]) || /<html|<!doctype/i.test(b[2]));
  if (html) return html[2].trim();
  // Reply got cut off before the closing fence
  const open = String(text).match(/```html\s*\n([\s\S]*)$/i);
  if (open && /<body|<div|<script/i.test(open[1])) return open[1].trim();
  const raw = String(text).match(/<!doctype html[\s\S]*<\/html>/i);
  return raw ? raw[0] : "";
}
const tooBig = (m) => /too large|tokens per minute|\bTPM\b|rate_limit|request.*large|context length|maximum context/i.test(m || "");

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (s.role === "AGENT" && !(await can(s, "aiBuilder"))) return NextResponse.json({ error: "Admin has turned off AI Builder for agents." }, { status: 403 });
  const { messages = [], current = "" } = await req.json().catch(() => ({}));
  const turns = messages.filter((m) => m && m.content && ["user", "assistant"].includes(m.role))
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 3000) }));
  if (!turns.length || turns[turns.length - 1].role !== "user") return NextResponse.json({ error: "Describe what to build first." }, { status: 400 });

  const creator = (await getSettings().catch(() => ({}))).creatorName || "Balaj";
  const file = String(current || "").slice(0, 24000);
  const system = SYS(creator) + (file ? `\n\nCURRENT FILE (edit this):\n\`\`\`html\n${file}\n\`\`\`` : "");

  async function run(history, maxTokens, sys = system) {
    const reply = await askAI(sys, history, { maxTokens, knowledge: false });
    return { reply, html: extract(reply) };
  }
  try {
    let out;
    try {
      out = await run(turns.slice(-8), 7000);
    } catch (e) {
      // Free plans cap how much text fits in one request. Retry lean: last request only, smaller answer.
      if (!tooBig(e.message)) throw e;
      out = await run(turns.slice(-1), 4000, SYS(creator) + (file ? `\n\nCURRENT FILE (edit this):\n\`\`\`html\n${file.slice(0, 9000)}\n\`\`\`` : ""));
    }
    const note = out.reply.replace(/```[\s\S]*?(```|$)/g, "").trim();
    return NextResponse.json({ note: note || (out.html ? "Here it is." : ""), html: out.html, reply: out.html ? "" : out.reply });
  } catch (e) {
    const m = e.message || "";
    if (tooBig(m)) return NextResponse.json({ error: "That build is too big for the free AI limit right now. Wait a minute, ask for a smaller change, or start a New build. (A free Google Gemini key in Connectors allows much bigger builds.)" }, { status: 429 });
    return NextResponse.json({ error: /AI key|AI request|Groq|limit/i.test(m) ? m : friendlyError(e) }, { status: 500 });
  }
}
