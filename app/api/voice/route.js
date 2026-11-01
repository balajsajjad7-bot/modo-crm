import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { configFor } from "@/lib/connectors";
import { getSettings } from "@/lib/settings";
import { alert } from "@/lib/bots";
import { buildSwml, parseRoutes, argsOf, callerOf, transferReply, normDest } from "@/lib/voiceAgent";

// AI receptionist (SignalWire). Public endpoint, protected by the secret key from Connectors → SignalWire.
//   ?op=swml     → the call script SignalWire runs when your number rings (point the number here)
//   ?op=fn       → the AI's tools: lookup_caller, transfer_to_department, take_message
//   ?op=summary  → end-of-call summary → #modo-bot
export const dynamic = "force-dynamic";

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const json = (v, status = 200) => NextResponse.json(v, { status, headers: { "cache-control": "no-store" } });
const last10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);

async function setup() {
  const cfg = await configFor("signalwire");
  if (!cfg?.secret) return null;
  return { ...cfg, routes: parseRoutes(cfg.routes) };
}

function baseUrl(req, cfg) {
  if (cfg.baseUrl) return String(cfg.baseUrl).replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  return (h.get("x-forwarded-proto") || "https") + "://" + host;
}

async function departments(routes) {
  const rows = await db.department.findMany({ select: { name: true }, orderBy: { createdAt: "asc" } }).catch(() => []);
  const names = new Set(rows.map((r) => r.name));
  // Routes typed for a name that isn't (yet) a Modo department still work.
  for (const n of Object.keys(routes)) if (!names.has(n)) rows.push({ name: n });
  return rows;
}

async function handle(req) {
  const u = new URL(req.url);
  const cfg = await setup();
  if (!cfg) return json({ error: "AI receptionist isn't set up: add the SignalWire connector in Modo → Connectors." }, 503);
  if (!same(u.searchParams.get("key") || "", cfg.secret)) return json({ error: "Wrong key." }, 401);
  const op = u.searchParams.get("op") || "swml";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  if (op === "swml") {
    const s = await getSettings().catch(() => ({}));
    return json(buildSwml({
      base: baseUrl(req, cfg), key: cfg.secret, company: cfg.company || s.companyName || "Voice Verve",
      departments: await departments(cfg.routes), routes: cfg.routes, greeting: cfg.greeting, voice: cfg.voice, hints: cfg.notes,
    }));
  }

  const callId = String(body.call_id || body.ai_session_id || Date.now()).slice(0, 60);
  const caller = callerOf(body);

  if (op === "fn") {
    const fn = body.function;
    const args = argsOf(body);

    if (fn === "lookup_caller") {
      const tail = last10(caller);
      if (tail.length < 10) return json({ response: "The caller's number is hidden, so treat them as a new caller." });
      const c = await db.contact.findFirst({ where: { phone: { contains: tail.slice(-7) } }, orderBy: { updatedAt: "desc" }, select: { name: true, phone: true } }).catch(() => null);
      if (!c || last10(c.phone) !== tail) return json({ response: "Not on file — a new caller." });
      return json({ response: `Existing customer. First name: ${String(c.name).split(/\s+/)[0]}.` }); // first name only, nothing else private
    }

    if (fn === "transfer_to_department") {
      const r = transferReply(args, cfg.routes, caller);
      if (r.note) await alert(`voice-${callId}-xfer`, r.note, { wa: false }).catch(() => {});
      return json(r.result);
    }

    if (fn === "take_message") {
      const back = normDest(args.callback_number) || caller || "not given";
      await alert(`voice-${callId}-msg`, `📝 Callback request (AI receptionist)\n${args.caller_name || "Caller"} · ${back}\n${String(args.message || "").slice(0, 600)}`, { urgent: true }).catch(() => {});
      return json({ response: "Message saved and sent to the team. Tell the caller someone will call them back soon, thank them, and say goodbye." });
    }

    return json({ response: `Unknown function ${fn}.` });
  }

  if (op === "summary") {
    const sum = String(body.post_prompt_data?.raw || body.post_prompt_data?.substituted || "").trim();
    if (sum) await alert(`voicesum-${callId}`, `☎️ Call summary · ${caller || "unknown number"}\n${sum.slice(0, 1200)}`, { push: false, wa: false }).catch(() => {});
    return json({ response: "ok" });
  }

  return json({ error: "Unknown op." }, 400);
}

export const GET = handle;
export const POST = handle;
