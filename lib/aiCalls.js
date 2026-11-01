// AI crew phone calls (SignalWire). A crew member calls a customer back when a callback task is assigned to it:
// it says it's an AI assistant straight away, only calls inside the customer's legal calling hours (federal + stricter
// states, holidays), honours "don't call me", and writes the outcome back to the task and Recent calls.
// Off until the admin turns on "aiCalls" in Connectors → SignalWire.
import { areaInfo, tzFor } from "./usdata";
import { callWindow } from "./intel/rules";

export const usDigits = (p) => { const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : ""; };
export const phoneIn = (text) => { const m = String(text || "").match(/(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}/); return m ? usDigits(m[0]) : ""; };
export const callingOn = (cfg) => /^(on|yes|true|1)$/i.test(String(cfg?.aiCalls || "").trim());

// May we call this US number right now? { ok, reason, local }
export function canCallNow(phone, now = new Date()) {
  const d = usDigits(phone);
  if (!d) return { ok: false, reason: "not a valid US phone number" };
  const info = areaInfo(d.slice(0, 3));
  if (!info?.state) return { ok: false, reason: "unknown area code, so the customer's local time can't be checked" };
  const tz = tzFor(info.state);
  const win = tz ? callWindow(info.state, tz.iana, now) : null;
  if (!win) return { ok: false, reason: "couldn't work out the customer's time zone" };
  return { ok: win.allowed, reason: win.allowed ? "" : win.note, local: win.local, state: info.state };
}

export const OUTCOMES = ["reached", "callback_later", "not_interested", "do_not_call", "wrong_number", "voicemail", "no_answer"];

// SWML for the call itself.
export function outboundSwml({ base, key, company, me, task, contactName, taskId, aiId }) {
  const q = `?key=${encodeURIComponent(key)}&task=${encodeURIComponent(taskId)}&ai=${encodeURIComponent(aiId)}`;
  const first = String(me.name || "").split(/[\s(]/)[0] || "Alex";
  const who = contactName ? `Is this ${contactName.split(" ")[0]}?` : "Who am I speaking with?";
  return {
    version: "1.0.0",
    sections: {
      main: [
        { answer: {} },
        {
          ai: {
            prompt: {
              temperature: 0.4,
              pom: [
                { title: "Who you are", body: `You are ${first}, an AI assistant calling on behalf of ${company}. You already told the person at the start of the call that you're an AI assistant; if they ask again, say so plainly. Never claim to be human.` },
                { title: "Why you're calling", body: `This is a callback the team scheduled. The task: "${String(task.title || "").slice(0, 300)}".${task.notes ? ` Notes from the team: ${String(task.notes).slice(0, 800)}` : ""}` },
                {
                  title: "How the call goes",
                  bullets: [
                    "Confirm you're speaking with the right person. If not, apologise, call save_outcome with wrong_number and end politely.",
                    "Briefly say why you're calling, then listen. Answer questions using only the company knowledge you have; if you don't know, say a team member will follow up.",
                    "If they're busy, ask for a better time and call save_outcome with callback_later and that time.",
                    "If they say they don't want calls, apologise, confirm they won't be called again, and call save_outcome with do_not_call right away.",
                    "If you reach voicemail, leave one short message: your name, that you're an AI assistant from the company returning their call, and that the team will try again. Then save_outcome with voicemail.",
                    "Before ending any call, call save_outcome once with the result and a one-line note.",
                  ],
                },
                { title: "Rules", bullets: ["Keep each reply to one or two short sentences.", "Never ask for card numbers, PINs, passwords or Social Security numbers.", "Never pressure, never promise prices, discounts or gifts that aren't in the company knowledge.", "Don't close a sale or take payment on the call; if they want to go ahead, say a team member will call to finish it and save_outcome with reached."] },
              ],
            },
            post_prompt: { text: "Summarize this call for the team in 2 short lines: what the customer said and what happens next." },
            post_prompt_url: `${base}/api/voice${q}&op=outsum`,
            params: { static_greeting: `Hi, this is ${first}, an AI assistant calling from ${company}, returning your callback. ${who}`, static_greeting_no_barge: false, end_of_speech_timeout: 800, attention_timeout: 12000, inactivity_timeout: 45000 },
            languages: [{ name: "English", code: "en-US", voice: "elevenlabs.rachel" }],
            SWAIG: {
              functions: [{
                function: "save_outcome",
                description: "Record how the call went. Call it once, before the call ends.",
                parameters: {
                  type: "object",
                  properties: {
                    outcome: { type: "string", enum: OUTCOMES.filter((o) => o !== "no_answer"), description: "What happened" },
                    note: { type: "string", description: "One line for the team" },
                    callback_time: { type: "string", description: "If they asked to be called later: when, in their words (e.g. 'tomorrow 3pm')" },
                  },
                  required: ["outcome"],
                },
                web_hook_url: `${base}/api/voice${q}&op=outfn`,
              }],
            },
          },
        },
        { hangup: {} },
      ],
    },
  };
}

// Place the call through SignalWire's REST API. Returns { ok, callId?, error? }.
export async function placeCall({ creds, from, to, url }) {
  try {
    const r = await fetch(`https://${creds.space}/api/calling/calls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Basic " + Buffer.from(`${creds.projectId}:${creds.apiToken}`).toString("base64") },
      body: JSON.stringify({ command: "dial", params: { from, to, caller_id: from, url, timeout: 30, max_duration: 1200 } }),
      signal: AbortSignal.timeout(12000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: `SignalWire ${r.status} ${JSON.stringify(d).slice(0, 120)}` };
    return { ok: true, callId: d.call_id || d.id || "" };
  } catch (e) { return { ok: false, error: e.message }; }
}

// "tomorrow 3pm", "in 2 hours", "Friday" → a Date (best effort; defaults to tomorrow, same time).
export function whenFrom(text, now = new Date()) {
  const t = String(text || "").toLowerCase();
  const d = new Date(now);
  let m;
  if ((m = t.match(/in\s+(\d+)\s*(min|minute|hour|hr|day)/))) { const n = +m[1]; d.setTime(d.getTime() + n * (/^min/.test(m[2]) ? 60000 : /^(hour|hr)/.test(m[2]) ? 3600000 : 86400000)); return d; }
  d.setTime(d.getTime() + 86400000);
  return d;
}
