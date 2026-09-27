// AI quality review of a finished call: scores, grammar mistakes, nervous moments, compliance checklist, coaching.
import { db } from "./db";
import { askAI } from "./ai";

export const CRITERIA = ["greeting", "pitch", "disclosure", "closing", "empathy", "clarity", "grammar", "confidence", "compliance"];
export const LABELS = { greeting: "Greeting", pitch: "Pitch", disclosure: "Disclosure", closing: "Closing", empathy: "Empathy", clarity: "Clarity", grammar: "Grammar & language", confidence: "Confidence", compliance: "Compliance" };
export const CHECKS = ["Introduced self and company", "Said the call may be recorded or monitored", "Stated the monthly price clearly", "Explained contract length and any fees", "No misleading or pressure claims", "Confirmed the customer's details", "Got clear agreement before closing"];

const FILLER = /\b(um+|uh+|uhm+|erm+|hmm+|you know|i mean|sort of|kind of)\b/gi;
const parse = (t) => (t || "").split("\n").filter(Boolean).map((l) => (l.startsWith("C: ") ? ["C", l.slice(3)] : ["A", l.startsWith("A: ") ? l.slice(3) : l]));
const words = (s) => (s.match(/\b[\w']+\b/g) || []).length;

const SYS = `You are the Quality Assurance (QA) department of a US call center selling utility-bill discounts and phone plans.
You review one finished call. Lines start with "Agent:" or "Customer:" (there may be no Customer lines if only the agent was recorded).
Speech-to-text may contain recognition errors; only flag grammar that is clearly the agent's own mistake (wrong tense, subject-verb agreement, wrong word, unclear sentence, very informal or rude wording), not transcription noise.
Return JSON only:
{"scores":{"greeting":0-10,"pitch":0-10,"disclosure":0-10,"closing":0-10,"empathy":0-10,"clarity":0-10,"grammar":0-10,"confidence":0-10,"compliance":0-10},
 "grammar":[{"said":"exact agent words","better":"corrected version","why":"short reason"}],
 "nervous":[{"said":"exact agent words","sign":"why it sounds nervous: filler, false start, apologising, unsure…"}],
 "compliance":[${CHECKS.map((c) => `{"item":"${c}","passed":true|false,"note":"short"}`).join(",")}],
 "strengths":["max 3 short points"],"improve":["max 3 specific coaching points"],
 "agentNervous":0-100,"customerNervous":0-100,"sentiment":"positive"|"neutral"|"negative",
 "outcome":"sale"|"callback"|"not interested"|"no answer"|"other",
 "summary":"two sentences: what happened and how it ended","confused":"agent"|"customer"|"both"|"none","confusedNote":"short or empty",
 "endedBy":"customer"|"agent"|"unknown"}
Up to 10 grammar items and 6 nervous items. If a check can't be judged from the transcript, set passed false and note "not heard".`;

export async function runQA(callSessionId) {
  const c = await db.callSession.findUnique({ where: { id: callSessionId } });
  if (!c) throw new Error("Call not found.");
  const L = parse(c.transcript);
  const agentText = L.filter(([w]) => w === "A").map(([, t]) => t).join(" ");
  const custText = L.filter(([w]) => w === "C").map(([, t]) => t).join(" ");
  const agentWords = words(agentText), customerWords = words(custText);
  if (agentWords < 15) return null; // too short to judge
  const fillers = (agentText.match(FILLER) || []).length;
  const minutes = Math.max(0.5, ((c.endedAt || new Date()) - c.startedAt) / 60000);
  const talkShare = customerWords ? agentWords / (agentWords + customerWords) : 1;
  const wpm = Math.round(agentWords / (minutes * Math.max(0.3, talkShare)));
  const transcript = L.map(([w, t]) => `${w === "C" ? "Customer" : "Agent"}: ${t}`).join("\n").slice(-14000);
  const r = await askAI(SYS, `Call length: ${minutes.toFixed(1)} min. Agent filler words counted: ${fillers}.\n\n${transcript}`, { json: true, maxTokens: 2500 });
  if (!r || !r.scores) throw new Error("The AI didn't return a review. Try again.");
  const scores = Object.fromEntries(CRITERIA.map((k) => [k, Math.max(0, Math.min(10, Math.round(Number(r.scores[k]) || 0)))]));
  const overall = Math.round((CRITERIA.reduce((t, k) => t + scores[k], 0) / (CRITERIA.length * 10)) * 100);
  const list = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);
  const data = {
    userId: c.userId, overall, scores: JSON.stringify(scores), grammar: JSON.stringify(list(r.grammar, 10)), nervous: JSON.stringify(list(r.nervous, 6)),
    compliance: JSON.stringify(list(r.compliance, CHECKS.length).map((x) => ({ item: String(x.item || ""), passed: !!x.passed, note: String(x.note || "") }))),
    highlights: JSON.stringify({ strengths: list(r.strengths, 3), improve: list(r.improve, 3) }),
    fillers, agentWords, customerWords, wpm: Number.isFinite(wpm) ? wpm : null,
    agentNervous: Number.isFinite(+r.agentNervous) ? Math.round(+r.agentNervous) : null, customerNervous: customerWords && Number.isFinite(+r.customerNervous) ? Math.round(+r.customerNervous) : null,
    sentiment: r.sentiment || null, outcome: r.outcome || null, summary: r.summary || null,
  };
  const qa = await db.qaReview.upsert({ where: { callSessionId }, update: { ...data, createdAt: new Date() }, create: { callSessionId, ...data } });
  // keep the call record in step (score on the agent's screen, overview table)
  const legacy = { greeting: Math.round(scores.greeting * 2.5), pitch: Math.round(scores.pitch * 2.5), disclosure: Math.round(scores.disclosure * 2.5), closing: Math.round(scores.closing * 2.5),
    strengths: list(r.strengths, 3).join(" "), improve: list(r.improve, 3).join(" ") };
  const upd = { score: overall, review: JSON.stringify(legacy), summary: r.summary || c.summary, agentNerv: data.agentNervous ?? c.agentNerv, custNerv: data.customerNervous ?? c.custNerv };
  if (r.confused) { upd.confused = r.confused; upd.confusedNote = r.confusedNote || null; }
  if ((!c.endedBy || c.endedBy === "unknown") && r.endedBy && r.endedBy !== "unknown") { upd.endedBy = r.endedBy; upd.endedBySource = "ai"; }
  await db.callSession.update({ where: { id: c.id }, data: upd });
  return qa;
}
