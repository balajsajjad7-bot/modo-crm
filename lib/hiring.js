// Hiring: candidates, the English fluency test, interview slots and Zoom interviews.
// Main list in one blob; each candidate's test answers (and voice answers) in their own blobs, so many
// candidates can take the test at the same time without overwriting each other.
import crypto from "crypto";
import { db } from "./db";
import { enc, dec } from "./crypto";
import { buildTest, finalScore, TRACKS } from "./englishTest";

const MAIN = "modo-hiring";
const testId = (cid) => "hire-test-" + cid;
const audId = (cid, item) => `hire-aud-${cid}-${item}`.slice(0, 190);
export const STAGES = ["invited", "testing", "tested", "interview", "hired", "rejected", "on hold"];
const DEFAULT_SETTINGS = { passMark: { support: 58, outreach: 50 }, zoomLink: "", interviewer: "", mins: 30, company: "Modo", zoom: null, linkDays: 7, applyOpen: true };

async function getBlob(id) {
  const b = await db.fileBlob.findUnique({ where: { id } }).catch(() => null);
  return b;
}
async function getJson(id, fallback) { const b = await getBlob(id); try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : fallback; } catch { return fallback; } }
async function putJson(id, v) {
  const data = Buffer.from(JSON.stringify(v), "utf8");
  await db.fileBlob.upsert({ where: { id }, update: { data, size: data.length }, create: { id, userId: "system", name: id, mime: "application/json", size: data.length, data } });
}
const clean = (s, n = 200) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const nid = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");

export async function loadHiring() {
  const v = await getJson(MAIN, {});
  return { candidates: v.candidates || [], slots: v.slots || [], settings: { ...DEFAULT_SETTINGS, ...(v.settings || {}), passMark: { ...DEFAULT_SETTINGS.passMark, ...(v.settings?.passMark || {}) } } };
}
async function saveHiring(v) { v.candidates = v.candidates.slice(0, 2000); await putJson(MAIN, v); }

// Settings as the admin sees them (the Zoom secret never leaves the server).
export function publicSettings(s) {
  const z = s.zoom || {};
  return { ...s, zoom: { accountId: z.accountId || "", clientId: z.clientId || "", hasSecret: !!z.secret } };
}
export async function saveSettings(input) {
  const v = await loadHiring(); const s = v.settings;
  if (input.passMark) for (const t of Object.keys(TRACKS)) if (input.passMark[t] != null) s.passMark[t] = Math.max(20, Math.min(80, parseInt(input.passMark[t], 10) || 50));
  if ("zoomLink" in input) { const l = clean(input.zoomLink, 300); if (l && !/^https:\/\/([\w-]+\.)*zoom\.(us|com)\//i.test(l)) throw new Error("That doesn't look like a Zoom link (https://…zoom.us/…)."); s.zoomLink = l; }
  for (const k of ["interviewer", "company"]) if (k in input) s[k] = clean(input[k], 80);
  if ("mins" in input) s.mins = Math.max(10, Math.min(180, parseInt(input.mins, 10) || 30));
  if ("applyOpen" in input) s.applyOpen = !!input.applyOpen;
  if ("linkDays" in input) s.linkDays = Math.max(1, Math.min(60, parseInt(input.linkDays, 10) || 7));
  if (input.zoom) {
    const z = s.zoom || {};
    s.zoom = { accountId: clean(input.zoom.accountId, 80), clientId: clean(input.zoom.clientId, 80), secret: input.zoom.clientSecret ? enc(String(input.zoom.clientSecret).trim()) : z.secret || "" };
    if (!s.zoom.accountId && !s.zoom.clientId) s.zoom = null;
  }
  await saveHiring(v); return publicSettings(s);
}
export function zoomCreds(s) {
  const z = s.zoom; if (!z?.accountId || !z?.clientId || !z?.secret) return null;
  return { accountId: z.accountId, clientId: z.clientId, clientSecret: dec(z.secret) };
}

export async function addCandidate(input, source = "admin") {
  const v = await loadHiring();
  const now = new Date();
  const c = {
    id: nid(), token: crypto.randomBytes(18).toString("base64url"), source,
    name: clean(input.name, 80), email: clean(input.email, 120), phone: clean(input.phone, 40),
    track: TRACKS[input.track] ? input.track : "support", position: clean(input.position, 80), notes: clean(input.notes, 1000),
    status: "invited", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + v.settings.linkDays * 86400000).toISOString(), interviews: [],
  };
  if (!c.name) throw new Error("Add the candidate's name.");
  if (source === "apply" && v.candidates.filter((x) => x.source === "apply" && Date.now() - new Date(x.createdAt) < 86400000).length > 200) throw new Error("Too many applications today. Try again tomorrow.");
  v.candidates.unshift(c); await saveHiring(v); return c;
}
export async function updateCandidate(id, patch) {
  const v = await loadHiring(); const c = v.candidates.find((x) => x.id === id);
  if (!c) throw new Error("Candidate not found.");
  for (const k of ["name", "email", "phone", "position", "notes"]) if (k in patch) c[k] = clean(patch[k], k === "notes" ? 1000 : 120);
  if (TRACKS[patch.track]) c.track = patch.track;
  if (STAGES.includes(patch.status)) c.status = patch.status;
  if (patch.newLink) { c.token = crypto.randomBytes(18).toString("base64url"); c.expiresAt = new Date(Date.now() + v.settings.linkDays * 86400000).toISOString(); }
  if (patch.resetTest) { await db.fileBlob.deleteMany({ where: { id: { startsWith: "hire-" + "aud-" + c.id } } }).catch(() => {}); await db.fileBlob.deleteMany({ where: { id: testId(c.id) } }).catch(() => {}); delete c.result; c.status = "invited"; c.expiresAt = new Date(Date.now() + v.settings.linkDays * 86400000).toISOString(); }
  await saveHiring(v); return c;
}
export async function deleteCandidate(id) {
  const v = await loadHiring(); v.candidates = v.candidates.filter((x) => x.id !== id); await saveHiring(v);
  await db.fileBlob.deleteMany({ where: { OR: [{ id: testId(id) }, { id: "hire-cv-" + id }, { id: { startsWith: "hire-aud-" + id } }] } }).catch(() => {});
}

// ── The test, seen from the candidate's link ──
export async function byToken(token) {
  if (!token || String(token).length < 20) return null;
  const v = await loadHiring();
  const c = v.candidates.find((x) => x.token === token);
  return c ? { c, v } : null;
}
export async function getTest(c) {
  let t = await getJson(testId(c.id), null);
  if (!t) { t = { ...buildTest(c.id, c.track), answers: {}, events: { tab: 0, paste: 0 }, startedAt: null, finishedAt: null }; await putJson(testId(c.id), t); }
  return t;
}
export async function saveTest(c, t) { await putJson(testId(c.id), t); }
export async function markStarted(c) {
  const v = await loadHiring(); const x = v.candidates.find((y) => y.id === c.id);
  if (x && x.status === "invited") { x.status = "testing"; x.startedAt = new Date().toISOString(); await saveHiring(v); }
}
export async function saveAudio(cid, item, buf, mime) {
  const id = audId(cid, item);
  await db.fileBlob.upsert({ where: { id }, update: { data: buf, size: buf.length, mime }, create: { id, userId: "system", name: id, mime, size: buf.length, data: buf } });
}
export async function getAudio(cid, item) { return getBlob(audId(cid, item)); }

// AI marks the email and the role-play (rubric scores 0–100). Never decisive on its own: the admin sees everything.
async function aiGrade(test, answers) {
  const out = {};
  let askAI; try { ({ askAI } = await import("./ai")); } catch { return out; }
  const w = test.items.find((i) => i.section === "write"); const wa = answers[w?.id]?.text;
  if (w && wa) {
    try {
      const n = wa.split(/\s+/).filter(Boolean).length;
      const r = await askAI(`You are a strict, fair English examiner hiring agents for a US call center. Mark the candidate's email answer.
Task: ${w.prompt}
Return JSON: {"grammar":0-100,"vocabulary":0-100,"tone":0-100,"clarity":0-100,"task":0-100,"overall":0-100,"feedback":"2 short sentences: main strength, main weakness"}.
Native-level professional writing ≈ 90+. Many grammar mistakes ≈ 40 or less. Off-topic or under ${w.minWords} words: overall ≤ 35 (this answer has ${n} words).`, wa.slice(0, 4000), { json: true, knowledge: false, maxTokens: 400 });
      if (r && typeof r.overall === "number") out.write = r;
    } catch {}
  }
  const s = test.items.find((i) => i.section === "speak"); const sa = answers[s?.id];
  if (s && sa?.transcript) {
    try {
      const n = sa.transcript.split(/\s+/).filter(Boolean).length; const wpm = sa.secs ? Math.round((n / sa.secs) * 60) : null;
      const r = await askAI(`You are a strict, fair English examiner hiring agents for US phone calls. Below is a speech-to-text transcript of the candidate answering a role-play (${sa.secs || "?"} seconds, ${n} words${wpm ? ", " + wpm + " words/minute" : ""}).
Situation: ${s.prompt}
Return JSON: {"fluency":0-100,"grammar":0-100,"vocabulary":0-100,"tone":0-100,"task":0-100,"overall":0-100,"feedback":"2 short sentences"}.
Judge English fluency, grammar, word choice and a professional, friendly tone. Under 15 words or off-topic: overall ≤ 30. Ignore small transcription errors.`, sa.transcript.slice(0, 3000), { json: true, knowledge: false, maxTokens: 400 });
      if (r && typeof r.overall === "number") out.speak = r;
    } catch {}
  }
  return out;
}

export async function finishTest(c, t) {
  if (!t.finishedAt) t.finishedAt = new Date().toISOString();
  const ai = await aiGrade(t, t.answers);
  const res = finalScore(t, t.answers, ai);
  t.result = { ...res, ai };
  await saveTest(c, t);
  const v = await loadHiring(); const x = v.candidates.find((y) => y.id === c.id);
  const pass = res.score >= (v.settings.passMark[x?.track || "support"] || 50);
  if (x) {
    x.result = { score: res.score, cefr: res.cefr, skills: res.skills, sections: res.sections, needsReview: res.needsReview, pass, feedback: { write: ai.write?.feedback || "", speak: ai.speak?.feedback || "" }, finishedAt: t.finishedAt, flags: { tab: t.events?.tab || 0, paste: t.events?.paste || 0, mins: t.startedAt ? Math.round((new Date(t.finishedAt) - new Date(t.startedAt)) / 60000) : null } };
    if (x.status === "testing" || x.status === "invited") x.status = "tested";
    await saveHiring(v);
  }
  try {
    const { alert } = await import("./bots");
    await alert("hire-done-" + c.id, `🎓 ${c.name} finished the English test (${TRACKS[c.track]}): ${res.score}/80 · ${res.cefr}${pass ? " ✅ passed" : " ❌ below pass mark"}${res.needsReview ? " · speaking needs your review" : ""}.\nOpen Team → Hiring & interviews.`, { wa: false });
  } catch {}
  return { ...res, pass };
}

// ── Resumes ──
async function patchCand(cid, fn) { const v = await loadHiring(); const c = v.candidates.find((x) => x.id === cid); if (!c) return null; fn(c); await saveHiring(v); return c; }
// Store the resume, then let Modo AI brief it (gives up after ~25 s; the recruiter can press "Brief it" later).
export async function attachCv(cid, file) {
  const { saveCv, briefCv } = await import("./cv");
  const info = await saveCv(cid, file);
  const c = await patchCand(cid, (x) => { x.cv = info; delete x.cvBrief; delete x.cvBriefErr; });
  if (!c) throw new Error("Candidate not found.");
  let brief = null, err = "";
  try { brief = await Promise.race([briefCv(cid, c), new Promise((_, no) => setTimeout(() => no(new Error("Modo AI took too long — press Brief it to try again.")), 25000))]); } catch (e) { err = e.message; }
  await patchCand(cid, (x) => { if (brief) x.cvBrief = brief; else x.cvBriefErr = err; });
  try {
    const { alert } = await import("./bots");
    await alert("hire-cv-" + cid + info.at, `📄 ${c.name} sent a resume${brief ? `: ${brief.headline} · fit ${"★".repeat(brief.fit)}${"☆".repeat(5 - brief.fit)}` : ""}. Team → Hiring & interviews.`, { wa: false });
  } catch {}
  return { info, brief, err };
}
export async function rebriefCv(cid) {
  const { briefCv } = await import("./cv");
  const v = await loadHiring(); const c = v.candidates.find((x) => x.id === cid); if (!c) throw new Error("Candidate not found.");
  const brief = await briefCv(cid, c); if (!brief) throw new Error("No resume uploaded yet.");
  await patchCand(cid, (x) => { x.cvBrief = brief; delete x.cvBriefErr; });
  return brief;
}

// ── Interviews ──
export function openSlots(v) { const now = Date.now(); return v.slots.filter((s) => !s.bookedBy && new Date(s.at) > now + 30 * 60000).sort((a, b) => new Date(a.at) - new Date(b.at)); }
export async function addSlots(list) {
  const v = await loadHiring();
  for (const at of (list || []).slice(0, 50)) { const d = new Date(at); if (!isNaN(d) && d > new Date() && !v.slots.some((s) => s.at === d.toISOString())) v.slots.push({ id: nid(), at: d.toISOString() }); }
  v.slots = v.slots.filter((s) => s.bookedBy || new Date(s.at) > Date.now() - 86400000).sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 300);
  await saveHiring(v); return v.slots;
}
export async function removeSlot(id) { const v = await loadHiring(); v.slots = v.slots.filter((s) => s.id !== id || s.bookedBy); await saveHiring(v); }

export async function scheduleInterview(cid, { at, mins, interviewer, link }, fromSlot = null) {
  const v = await loadHiring(); const c = v.candidates.find((x) => x.id === cid);
  if (!c) throw new Error("Candidate not found.");
  const d = new Date(at); if (isNaN(d)) throw new Error("Pick the interview date and time.");
  const m = Math.max(10, Math.min(180, parseInt(mins, 10) || v.settings.mins || 30));
  let zoom = null, warn = "";
  const manual = clean(link, 300);
  const creds = zoomCreds(v.settings);
  if (manual) zoom = { joinUrl: manual };
  else if (creds) {
    try { const { createZoomMeeting } = await import("./zoom"); zoom = await createZoomMeeting(creds, { topic: `${v.settings.company || "Modo"} interview — ${c.name}`, startISO: d.toISOString(), mins: m }); }
    catch (e) { warn = e.message; }
  }
  if (!zoom && v.settings.zoomLink) zoom = { joinUrl: v.settings.zoomLink };
  if (!zoom) warn = (warn ? warn + " " : "") + "No Zoom link yet — add yours in Hiring → Settings & Zoom (or paste one on the interview) and the invite will include it.";
  const iv = { id: nid(), at: d.toISOString(), mins: m, interviewer: clean(interviewer || v.settings.interviewer, 80), zoom, status: "scheduled", createdAt: new Date().toISOString(), ...(fromSlot ? { slotId: fromSlot } : {}) };
  c.interviews = [...(c.interviews || []), iv];
  if (["invited", "testing", "tested", "on hold"].includes(c.status)) c.status = "interview";
  if (fromSlot) { const s = v.slots.find((x) => x.id === fromSlot); if (s) s.bookedBy = c.id; }
  await saveHiring(v);
  return { c, iv, warn };
}
export async function updateInterview(cid, ivId, patch) {
  const v = await loadHiring(); const c = v.candidates.find((x) => x.id === cid);
  const iv = c?.interviews?.find((x) => x.id === ivId); if (!iv) throw new Error("Interview not found.");
  if (["scheduled", "done", "no-show", "cancelled"].includes(patch.status)) iv.status = patch.status;
  if ("notes" in patch) iv.notes = clean(patch.notes, 3000);
  if (patch.link) { const l = clean(patch.link, 300); if (!/^https:\/\//i.test(l)) throw new Error("Paste the full Zoom link (https://…)."); iv.zoom = { ...(iv.zoom || {}), joinUrl: l, startUrl: undefined }; }
  if ("rating" in patch) iv.rating = Math.max(0, Math.min(5, parseInt(patch.rating, 10) || 0));
  if (patch.at) { const d = new Date(patch.at); if (!isNaN(d)) { iv.at = d.toISOString(); iv.reminded = false; } }
  if (iv.status === "cancelled") {
    if (iv.slotId) { const s = v.slots.find((x) => x.id === iv.slotId); if (s) delete s.bookedBy; }
    const creds = zoomCreds(v.settings); if (creds && iv.zoom?.meetingId) { const { deleteZoomMeeting } = await import("./zoom"); await deleteZoomMeeting(creds, iv.zoom.meetingId); }
  }
  await saveHiring(v); return c;
}

// Invitation text the admin can copy / send on WhatsApp or email.
export const withLink = (iv, s) => (iv.zoom?.joinUrl || !s.zoomLink ? iv : { ...iv, zoom: { joinUrl: s.zoomLink } });
export function inviteText(c, iv, s) {
  iv = withLink(iv, s);
  const when = new Date(iv.at);
  const pk = when.toLocaleString("en-US", { timeZone: "Asia/Karachi", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  const us = when.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `Hi ${c.name.split(" ")[0]}, your interview with ${s.company || "Modo"} is confirmed.\n\n📅 ${pk} (Pakistan time) · ${us} New York\n⏱️ ${iv.mins} minutes${iv.interviewer ? `\n👤 With ${iv.interviewer}` : ""}\n🎥 Zoom: ${iv.zoom?.joinUrl || "link coming shortly"}${iv.zoom?.passcode ? `\n🔑 Passcode: ${iv.zoom.passcode}` : ""}\n\nPlease join 5 minutes early from a quiet place with a headset, camera on. Good luck!`;
}
export function calendarLink(c, iv, s) {
  iv = withLink(iv, s);
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const end = new Date(new Date(iv.at).getTime() + iv.mins * 60000);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${s.company || "Modo"} interview — ${c.name}`)}&dates=${f(iv.at)}/${f(end)}&details=${encodeURIComponent("Zoom: " + (iv.zoom?.joinUrl || ""))}&location=${encodeURIComponent(iv.zoom?.joinUrl || "Zoom")}`;
}
