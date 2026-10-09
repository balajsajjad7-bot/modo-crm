// Modo English fluency test for hiring call-center agents — Versant-style (speaking, listening, reading,
// writing), scored on a 20–80 scale with an approximate CEFR level. Two tracks: customer service and outreach.
// All items are Modo's own. Correct answers never leave the server.

const READ = [
  "Thank you for calling customer support. My name is Sarah, and I will be happy to help you with your account today.",
  "Your new plan includes unlimited talk and text, and the monthly price stays the same for the first twelve months.",
  "I understand how frustrating this must be. Let me check your order and find the fastest way to fix it for you.",
  "Before we continue, may I please confirm the full name and the billing address on the account?",
  "The package left our warehouse on Monday morning and should arrive at your home within three business days.",
  "If you are happy with everything we discussed, I can activate the service for you right now on this call.",
];
const REPEAT = [
  "Could you spell your last name for me, please?",
  "The refund will appear on your card in five to seven days.",
  "I'm going to place you on a short hold while I check that.",
  "Is this still the best number to reach you on?",
  "We can schedule the technician for Thursday afternoon.",
  "Your account has been updated and you will receive an email shortly.",
  "Thank you for your patience while I looked into this.",
  "Most of our customers save about thirty dollars every month.",
];
const BUILD = [
  { parts: ["was delivered", "your order", "yesterday afternoon"], answer: "your order was delivered yesterday afternoon" },
  { parts: ["a few questions", "I just need", "to ask you"], answer: "I just need to ask you a few questions" },
  { parts: ["to the new plan", "would you like", "to switch"], answer: "would you like to switch to the new plan" },
  { parts: ["has been sent", "a confirmation email", "to your inbox"], answer: "a confirmation email has been sent to your inbox" },
  { parts: ["call you back", "tomorrow morning", "can I"], answer: "can I call you back tomorrow morning" },
  { parts: ["is a lower monthly bill", "what most people want", "honestly"], answer: "honestly what most people want is a lower monthly bill" },
];
const LISTEN = [
  { audio: "Customer: Hi, I was charged twice for my internet bill this month. Agent: I'm sorry about that. I can see the second payment, and I'll send it back to your card today.", q: "What will the agent do?", options: ["Cancel the internet service", "Return the extra payment", "Lower the monthly price", "Call the bank"], answer: 1 },
  { audio: "Agent: Your technician can come on Tuesday between nine and twelve, or Wednesday after two. Customer: Wednesday works better, I'm at work Tuesday morning.", q: "When will the technician come?", options: ["Tuesday morning", "Tuesday afternoon", "Wednesday afternoon", "Wednesday morning"], answer: 2 },
  { audio: "Customer: I'd like to cancel. I'm moving to Texas next month. Agent: Actually, we have service in Texas. I can move your plan to your new address for free.", q: "Why does the customer want to cancel?", options: ["The price is too high", "They are moving", "The service is slow", "They found a better offer"], answer: 1 },
  { audio: "Agent: The package shows as delivered at the front door at four fifteen. Customer: That's strange, I was home all afternoon and nobody knocked.", q: "What is the problem?", options: ["The package is late", "The package was damaged", "The customer didn't receive a package marked delivered", "The address is wrong"], answer: 2 },
  { audio: "Agent: With the bundle you'd pay sixty-five a month instead of eighty-nine, and that includes the streaming service you're paying for separately now.", q: "How much would the customer pay with the bundle?", options: ["$89 a month", "$65 a month", "$24 a month", "$80 a month"], answer: 1 },
  { audio: "Customer: I've called three times about this and nobody ever calls me back. Agent: I completely understand. I'll stay with you on this call until it's solved.", q: "How does the agent respond?", options: ["Promises a call back later", "Transfers the call", "Stays on the call until it's fixed", "Asks the customer to call again"], answer: 2 },
];
const MCQ = [
  { q: "The customer ___ already paid the bill last week.", options: ["have", "has", "having", "is"], answer: 1 },
  { q: "I'll send you the details ___ email right after this call.", options: ["by", "on", "with", "at"], answer: 0 },
  { q: "If you ___ the order today, it will arrive on Friday.", options: ["will place", "placed", "place", "placing"], answer: 2 },
  { q: "Choose the most polite sentence:", options: ["Wait.", "Hold on, I'm busy.", "Could you please hold for a moment?", "You need to wait now."], answer: 2 },
  { q: "We ___ your request since Monday.", options: ["are processing", "have been processing", "processed", "process"], answer: 1 },
  { q: "\"I apologize for the inconvenience\" means:", options: ["I am sorry for the trouble", "It is not my fault", "Please call later", "Thank you for waiting"], answer: 0 },
  { q: "Neither the bill nor the receipts ___ correct.", options: ["is", "was", "are", "be"], answer: 2 },
  { q: "The best word: \"Our new plan is much ___ than your current one.\"", options: ["cheap", "more cheap", "cheaper", "cheapest"], answer: 2 },
  { q: "\"Let me look into that for you\" means the agent will:", options: ["Hang up", "Check the problem", "Transfer the call", "End the offer"], answer: 1 },
  { q: "She asked me where ___.", options: ["is the store", "the store is", "is store", "the store"], answer: 1 },
];
const DICTATION = [
  "Please keep this confirmation number for your records.",
  "Your next bill will be lower because the discount starts this month.",
  "I have noted your concern and sent it to our billing team.",
  "Can you confirm the last four digits of the phone number on the account?",
];
const WRITE = {
  support: [
    { prompt: "A customer emailed: \"I ordered a phone 10 days ago and it still hasn't arrived. Tracking hasn't changed in 5 days. This is ridiculous.\" Write a professional reply email (80–150 words): apologize, explain what you will do, and give a clear next step.", minWords: 60 },
    { prompt: "A customer writes: \"You charged me $40 more than last month and nobody told me why.\" Write a polite reply email (80–150 words) explaining you are checking the charge and what will happen next.", minWords: 60 },
  ],
  outreach: [
    { prompt: "Write a short follow-up email (80–150 words) to a customer you spoke with yesterday who said they were interested in saving money on their monthly bill but wanted to think about it. Be friendly, not pushy, and include a clear call to action.", minWords: 60 },
    { prompt: "Write a short email (80–150 words) to a customer whose discount offer expires on Friday. Remind them of the savings, answer the worry \"is this a scam?\" honestly, and invite them to call back.", minWords: 60 },
  ],
};
const SPEAK = {
  support: [
    { prompt: "Role-play: A customer calls and says angrily: \"My service has been down for two days and I work from home!\" Answer them as the agent. Calm them, show empathy, and explain what you'll do next.", secs: 60 },
    { prompt: "Role-play: A customer says: \"I want to cancel right now. Your company is terrible.\" Respond as the agent: stay calm, ask what went wrong, and try to keep them.", secs: 60 },
  ],
  outreach: [
    { prompt: "Role-play: You are calling a customer who did not expect your call. Introduce yourself and the US Campaign offer that can lower their monthly bill, and ask a question to keep them talking.", secs: 60 },
    { prompt: "Role-play: The customer says: \"I'm not interested, I'm busy.\" Respond in a friendly way, give one strong reason to listen for one more minute, and ask for a better time.", secs: 60 },
  ],
};

export const TRACKS = { support: "Customer service", outreach: "Outreaching / sales" };
export const SECTIONS = [
  { key: "read", title: "Read aloud", skill: "Speaking & reading", help: "Read each sentence out loud, clearly and at a natural speed. Press record, read, then press stop.", mins: 3 },
  { key: "repeat", title: "Repeat", skill: "Listening & speaking", help: "Listen to each sentence, then repeat it exactly. You can play it twice.", mins: 4 },
  { key: "build", title: "Sentence builds", skill: "Speaking", help: "Put the phrases in the right order and say the full sentence out loud.", mins: 3 },
  { key: "listen", title: "Conversations", skill: "Listening", help: "Listen to the short call, then choose the right answer.", mins: 4 },
  { key: "mcq", title: "Grammar & vocabulary", skill: "Reading", help: "Choose the best answer.", mins: 4 },
  { key: "dictation", title: "Dictation", skill: "Listening & writing", help: "Listen and type exactly what you hear. You can play it twice.", mins: 4 },
  { key: "write", title: "Email writing", skill: "Writing", help: "Write a professional email.", mins: 8 },
  { key: "speak", title: "Call role-play", skill: "Speaking", help: "Read the situation, then press record and answer as the agent for 30–60 seconds.", mins: 4 },
];

// Same candidate → same questions (seeded by their test id), different candidates → a different mix.
function rng(seed) { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
const pick = (arr, n, r) => arr.map((x, i) => [r(), x, i]).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, x, i]) => ({ ...(typeof x === "string" ? { text: x } : x), src: i }));

export function buildTest(seed, track = "support") {
  const r = rng(seed); const t = TRACKS[track] ? track : "support";
  const items = [
    ...pick(READ, 2, r).map((x, i) => ({ id: "read" + i, section: "read", type: "speak-text", text: x.text })),
    ...pick(REPEAT, 4, r).map((x, i) => ({ id: "repeat" + i, section: "repeat", type: "speak-audio", text: x.text })),
    ...pick(BUILD, 3, r).map((x, i) => ({ id: "build" + i, section: "build", type: "speak-build", parts: x.parts, answer: x.answer })),
    ...pick(LISTEN, 4, r).map((x, i) => ({ id: "listen" + i, section: "listen", type: "choice-audio", audio: x.audio, q: x.q, options: x.options, answer: x.answer })),
    ...pick(MCQ, 6, r).map((x, i) => ({ id: "mcq" + i, section: "mcq", type: "choice", q: x.q, options: x.options, answer: x.answer })),
    ...pick(DICTATION, 2, r).map((x, i) => ({ id: "dict" + i, section: "dictation", type: "type-audio", text: x.text })),
    ...pick(WRITE[t], 1, r).map((x) => ({ id: "write0", section: "write", type: "essay", prompt: x.prompt, minWords: x.minWords })),
    ...pick(SPEAK[t], 1, r).map((x) => ({ id: "speak0", section: "speak", type: "speak-open", prompt: x.prompt, secs: x.secs })),
  ];
  return { track: t, items };
}

// What the candidate's browser gets: no answers. Sentences to repeat / dictate are spoken by the browser, so the
// text is sent but never shown on screen.
export function publicItem(it) {
  const { answer, ...rest } = it; // eslint-disable-line no-unused-vars
  return rest;
}

const words = (s) => String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const NUM = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", twelve: "12", thirty: "30" };
const norm = (w) => NUM[w] || w;
// Word-level similarity (0–1): 1 = word-perfect.
export function accuracy(said, target) {
  const a = words(said).map(norm), b = words(target).map(norm);
  if (!b.length) return 0; if (!a.length) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return Math.max(0, 1 - d[a.length][b.length] / b.length);
}
// Speaking pace → 0–100 (natural call speed is roughly 120–170 words a minute).
export function paceScore(text, secs) {
  const n = words(text).length; if (!n || !secs) return null;
  const wpm = (n / secs) * 60;
  if (wpm >= 115 && wpm <= 175) return 100;
  return Math.max(0, Math.round(100 - (wpm < 115 ? (115 - wpm) * 1.4 : (wpm - 175) * 1.2)));
}

// Score one auto-marked item → 0–100 (speaking items need a transcript).
export function scoreItem(it, ans) {
  if (!ans) return 0;
  if (it.type === "choice" || it.type === "choice-audio") return Number(ans.choice) === it.answer ? 100 : 0;
  if (it.type === "type-audio") return Math.round(accuracy(ans.text, it.text) * 100);
  if (it.type === "speak-text" || it.type === "speak-audio") return ans.transcript == null ? null : Math.round(accuracy(ans.transcript, it.text) * 100);
  if (it.type === "speak-build") return ans.transcript == null ? null : Math.round(accuracy(ans.transcript, it.answer) * 100);
  return null;
}

// Versant-style 20–80 scale and an approximate CEFR level.
export const toScale = (pct) => Math.round(20 + Math.max(0, Math.min(100, pct)) * 0.6);
export function cefr(score) {
  if (score >= 79) return "C2"; if (score >= 69) return "C1"; if (score >= 58) return "B2"; if (score >= 47) return "B1"; if (score >= 30) return "A2"; return "A1";
}
export const CEFR_TEXT = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-intermediate — ready for most US calls", C1: "Advanced — excellent for US calls", C2: "Near-native" };

const avg = (xs) => { const v = xs.filter((x) => typeof x === "number" && !isNaN(x)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

// Put it all together. `ai` = { write: {...}, speak: {...} } graded by Modo AI (may be missing).
export function finalScore(test, answers, ai = {}) {
  const by = (sec) => test.items.filter((i) => i.section === sec).map((i) => scoreItem(i, answers[i.id]));
  const read = avg(by("read")), repeat = avg(by("repeat")), build = avg(by("build")), listen = avg(by("listen")), mcq = avg(by("mcq")), dict = avg(by("dictation"));
  const spoken = test.items.filter((i) => i.type.startsWith("speak") && answers[i.id]?.transcript);
  const pace = avg(spoken.map((i) => paceScore(answers[i.id].transcript, answers[i.id].secs)));
  const W = ai.write?.overall ?? null, S = ai.speak?.overall ?? null;
  const skills = {
    speaking: avg([read, repeat, build, S]),
    listening: avg([repeat, listen, dict]),
    reading: avg([read, mcq]),
    writing: avg([dict, W]),
    fluency: avg([pace, ai.speak?.fluency]),
    pronunciation: avg([read, repeat]),
  };
  const wts = test.track === "outreach" ? { speaking: 0.4, listening: 0.25, reading: 0.1, writing: 0.15, fluency: 0.1 } : { speaking: 0.3, listening: 0.25, reading: 0.15, writing: 0.2, fluency: 0.1 };
  let tot = 0, wsum = 0;
  for (const [k, w] of Object.entries(wts)) if (skills[k] != null) { tot += skills[k] * w; wsum += w; }
  const pct = wsum ? tot / wsum : 0;
  const score = toScale(pct);
  const scaled = Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, v == null ? null : toScale(v)]));
  const needsReview = test.items.some((i) => i.type.startsWith("speak") && answers[i.id] && answers[i.id].transcript == null);
  return { score, cefr: cefr(score), skills: scaled, sections: { read, repeat, build, listen, mcq, dictation: dict, write: W, speak: S }, needsReview };
}
