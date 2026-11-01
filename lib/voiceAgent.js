// Modo AI receptionist on SignalWire: answers support calls, works out what the caller needs,
// and puts them through to the right department. Everything here is pure (no database), so it can be tested on its own;
// app/api/voice/route.js wires it to Modo's departments, contacts and #modo-bot.

// "Customer Happiness = +13055550101; Outreach = sip:7001@pbx.example.com" (or one per line) → { name: dest }
export function parseRoutes(text) {
  const out = {};
  for (const part of String(text || "").split(/[;\n]+/)) {
    const m = part.match(/^\s*([^=:]+?)\s*[=:]\s*(\S.*?)\s*$/) || part.match(/^\s*(.+?)\s*[=]\s*(.+)$/);
    if (!m) continue;
    // "Name: sip:7001@x" — the first ":" splits name from destination, so re-join a sip: that got cut
    let [, name, dest] = m;
    if (/^sips?$/i.test(dest)) continue;
    const d = normDest(dest);
    if (name && d) out[name.trim()] = d;
  }
  return out;
}

// Phone numbers to E.164 (+1 for 10-digit US), SIP URIs kept as they are. Anything else → "".
export function normDest(v) {
  const s = String(v || "").trim();
  if (/^sips?:[^\s@]+@[^\s]+$/i.test(s)) return s;
  let n = s.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
  if (!n) return "";
  if (n.startsWith("+")) return /^\+\d{8,15}$/.test(n) ? n : "";
  n = n.replace(/^00/, "");
  if (n.length === 10) return "+1" + n;
  if (n.length === 11 && n.startsWith("1")) return "+" + n;
  return n.length >= 8 && n.length <= 15 ? "+" + n : "";
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Match what the model said ("customer_happiness", "Customer happiness", "billing" → the department whose name is closest).
export function pickDepartment(said, routes) {
  const names = Object.keys(routes);
  const k = slug(said);
  return names.find((n) => slug(n) === k) || names.find((n) => slug(n).includes(k) || k.includes(slug(n))) || null;
}

export const DEFAULT_GREETING = "Thanks for calling {company}. I'm the virtual assistant — how can I help you today?";

// The SWML document SignalWire runs when the number rings.
export function buildSwml({ base, key, company = "our company", departments = [], routes = {}, greeting, voice, hints = "" }) {
  const q = "?key=" + encodeURIComponent(key);
  const fnUrl = `${base}/api/voice${q}&op=fn`;
  const live = departments.filter((d) => routes[d.name]);
  const deptLines = live.map((d) => `- ${d.name}${d.about ? ": " + d.about : ""}`).join("\n") || "- (no departments are set up yet — take a message instead)";
  const hello = String(greeting || DEFAULT_GREETING).replace(/\{company\}/g, company);

  const prompt = [
    { title: "Role", body: `You are the friendly phone receptionist for ${company}. You answer customer support calls, find out what the caller needs, and connect them to the department that can help. You do not solve account problems yourself — the departments do that.` },
    { title: "Departments you can transfer to", body: deptLines },
    {
      title: "How a call goes",
      bullets: [
        "Right after you greet the caller, call lookup_caller once, quietly, so you know if they're an existing customer. If it returns a first name, use it naturally.",
        "Ask what the call is about. If it's unclear which department fits, ask one short follow-up question — never more than two before you decide.",
        "Tell the caller which department you're putting them through to and why in one sentence, then call transfer_to_department with that department and a one-line reason.",
        "If the caller asks for a person, a manager, or is upset, transfer them to the department closest to their issue straight away instead of asking more questions.",
        "If no department fits, the caller wants a callback, or a transfer can't be made, use take_message to record their name, best callback number and what they need, then tell them someone will call back.",
      ],
    },
    {
      title: "Style",
      bullets: [
        "This is a phone call: keep every reply to one or two short sentences, warm and plain. No lists, no reading out long details.",
        "Never ask for card numbers, PINs, passwords or Social Security numbers. If the caller starts giving them, politely stop them and say the department will verify them securely.",
        "Don't promise refunds, prices, delivery dates or outcomes — the department will handle that.",
        "Speak the language the caller speaks.",
      ],
    },
  ];
  if (hints) prompt.push({ title: "Company notes", body: String(hints).slice(0, 2000) });

  const enumNames = live.map((d) => d.name);
  const functions = [
    { function: "lookup_caller", description: "Check whether the caller's phone number belongs to an existing customer in the CRM. Takes no arguments.", parameters: { type: "object", properties: {} }, web_hook_url: fnUrl },
    {
      function: "transfer_to_department",
      description: "Connect the caller to a department. Only call this after telling the caller where you're sending them.",
      parameters: {
        type: "object",
        properties: {
          department: { type: "string", description: "The department to connect to", ...(enumNames.length ? { enum: enumNames } : {}) },
          reason: { type: "string", description: "One line on what the caller needs, for the person who picks up" },
          caller_name: { type: "string", description: "The caller's name if they gave it" },
        },
        required: ["department", "reason"],
      },
      web_hook_url: fnUrl,
    },
    {
      function: "take_message",
      description: "Record a callback request when no department fits, nobody can be reached, or the caller asks to be called back.",
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string", description: "The caller's name" },
          callback_number: { type: "string", description: "Best number to call them back on; leave empty to use the number they're calling from" },
          message: { type: "string", description: "What they need, in one or two sentences" },
        },
        required: ["message"],
      },
      web_hook_url: fnUrl,
    },
  ];

  return {
    version: "1.0.0",
    sections: {
      main: [
        { answer: {} },
        {
          ai: {
            prompt: { pom: prompt, temperature: 0.4 },
            post_prompt: { text: "Summarize the call for the support team in 2–3 short lines: who called (name if known), what they needed, where they were transferred or what message was taken, and the caller's mood." },
            post_prompt_url: `${base}/api/voice${q}&op=summary`,
            params: { static_greeting: hello, static_greeting_no_barge: false, end_of_speech_timeout: 800, attention_timeout: 15000, inactivity_timeout: 60000, local_tz: "America/New_York" },
            languages: [{ name: "English", code: "en-US", voice: voice || "elevenlabs.rachel" }],
            hints: enumNames,
            SWAIG: { functions },
          },
        },
      ],
    },
  };
}

// SWML that runs once the AI hands off: dial the department; if nobody picks up, apologise and end politely.
export function transferSwml(dest, department) {
  return {
    version: "1.0.0",
    sections: {
      main: [
        { connect: { to: dest, timeout: 35, answer_on_bridge: true } },
        {
          switch: {
            variable: "connect_result",
            case: { failed: [{ play: { url: `say:Sorry, nobody from ${department} could pick up right now. We've passed your details on and someone will call you back shortly. Goodbye.` } }] },
          },
        },
        { hangup: {} },
      ],
    },
  };
}

// SignalWire sends arguments as argument.parsed[0]; accept a plain args object too.
export function argsOf(body) {
  const p = body?.argument?.parsed;
  if (Array.isArray(p) && p[0] && typeof p[0] === "object") return p[0];
  if (body?.args && typeof body.args === "object") return body.args;
  return {};
}
export const callerOf = (body) => String(body?.caller_id_num || body?.call?.from || body?.meta_data?.from || "").trim();

// The reply for a transfer request. Returns { result, note } — note is what Modo posts to #modo-bot.
export function transferReply(args, routes, caller) {
  const dept = pickDepartment(args.department || "", routes);
  if (!dept) {
    return { result: { response: `There is no department called "${args.department}". Pick one of: ${Object.keys(routes).join(", ") || "none — use take_message"}.` }, note: null };
  }
  const who = args.caller_name ? `${args.caller_name} (${caller || "unknown number"})` : caller || "Unknown caller";
  return {
    result: {
      response: `Connecting the caller to ${dept} now.`,
      action: [{ SWML: transferSwml(routes[dept], dept), transfer: "true" }],
    },
    note: `📞 AI receptionist → ${dept}\n${who}\nReason: ${String(args.reason || "not given").slice(0, 300)}`,
    dept,
  };
}
