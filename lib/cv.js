// Candidate resumes: stored with the candidate, read (PDF, Word, text or a photo) and briefed by Modo AI in a few
// lines so the recruiter knows who they are before opening the file.
import { db } from "./db";

const cvId = (cid) => "hire-cv-" + cid;
export const CV_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};
export const CV_MAX = 6 * 1024 * 1024;

const mimeOf = (file) => {
  const t = String(file?.type || "").toLowerCase(); if (CV_TYPES[t]) return t;
  const n = String(file?.name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf"; if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".txt")) return "text/plain"; if (/\.jpe?g$/.test(n)) return "image/jpeg"; if (n.endsWith(".png")) return "image/png";
  return null;
};

export function checkCv(file) {
  if (!file || typeof file !== "object" || !file.size) return null;
  if (file.size > CV_MAX) throw new Error("Your resume is over 6 MB. Please upload a smaller PDF or Word file.");
  if (!mimeOf(file)) throw new Error("Please upload your resume as a PDF, Word (.docx), text file or a photo.");
  return true;
}

// Validate + store. Returns { name, mime, size } or throws a friendly error.
export async function saveCv(cid, file) {
  if (!file || typeof file !== "object" || !file.size) throw new Error("Choose your resume file.");
  if (file.size > CV_MAX) throw new Error("That file is over 6 MB. Please upload a smaller PDF or Word file.");
  const mime = mimeOf(file);
  if (!mime) throw new Error("Please upload a PDF, Word (.docx), text file or a photo of your resume.");
  const buf = Buffer.from(await file.arrayBuffer());
  // Magic-number check so a renamed file can't pretend to be a PDF / Word file.
  const sig = buf.subarray(0, 4).toString("hex");
  const okSig = mime === "application/pdf" ? sig.startsWith("25504446") : mime.includes("wordprocessingml") ? sig === "504b0304" : mime === "image/png" ? sig === "89504e47" : mime === "image/jpeg" ? sig.startsWith("ffd8ff") : true;
  if (!okSig) throw new Error("That file doesn't look like a real " + CV_TYPES[mime].toUpperCase() + ". Please upload the original file.");
  const name = String(file.name || "resume." + CV_TYPES[mime]).replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const id = cvId(cid);
  await db.fileBlob.upsert({ where: { id }, update: { data: buf, size: buf.length, mime, name }, create: { id, userId: "system", name, mime, size: buf.length, data: buf } });
  return { name, mime, size: buf.length, at: new Date().toISOString() };
}
export async function getCv(cid) { return db.fileBlob.findUnique({ where: { id: cvId(cid) } }).catch(() => null); }
export async function deleteCv(cid) { await db.fileBlob.deleteMany({ where: { id: cvId(cid) } }).catch(() => {}); }

async function cvText(b) {
  const buf = Buffer.from(b.data);
  if (b.mime === "application/pdf") { const { extractText, getDocumentProxy } = await import("unpdf"); const pdf = await getDocumentProxy(new Uint8Array(buf)); const { text } = await extractText(pdf, { mergePages: true }); return String(text || ""); }
  if (b.mime.includes("wordprocessingml")) { const mammoth = (await import("mammoth")).default || (await import("mammoth")); const r = await mammoth.extractRawText({ buffer: buf }); return String(r.value || ""); }
  if (b.mime === "text/plain") return buf.toString("utf8");
  return null; // image: the AI reads the picture
}

const SYSTEM = `You are a recruiter's assistant for a call center hiring agents for US customer campaigns (customer support and outbound sales).
Read the candidate's resume and brief it for a busy recruiter. Return JSON only:
{"headline":"one line: who they are (e.g. 'BBA graduate, 2 yrs US telecom support')","experience":"years + where, very short","callCenter":"call-center / customer-facing experience, or 'None mentioned'","education":"highest education, short","skills":["up to 5 short skills"],"languages":"languages if stated","strengths":["2-3 short points"],"concerns":["0-3 short points: gaps, job-hopping, missing info"],"fit":1-5,"fitWhy":"one short sentence on fit for a US call-center role"}
Only use facts written in the resume. Never guess age, religion, marital status or other personal traits. Keep every value short.`;

export async function briefCv(cid, { name = "", track = "" } = {}) {
  const b = await getCv(cid); if (!b) return null;
  const { askAI, askFile } = await import("./ai");
  const hint = `Candidate: ${name || "unknown"}. Applying for: ${track === "outreach" ? "outreach / sales" : "customer support"}.`;
  let text = null;
  try { text = await cvText(b); } catch { text = null; }
  let r;
  if (text && text.replace(/\s+/g, "").length > 80) r = await askAI(SYSTEM, `${hint}\n\nRESUME:\n${text.replace(/\s+\n/g, "\n").slice(0, 12000)}`, { json: true, knowledge: false, maxTokens: 700 });
  else r = await askFile({ mime: b.mime, dataB64: Buffer.from(b.data).toString("base64"), system: SYSTEM, prompt: hint + " Brief this resume.", json: true, maxTokens: 700 });
  if (!r || typeof r !== "object" || !r.headline) throw new Error("Modo AI couldn't read this resume.");
  const s = (v, n = 160) => String(v ?? "").slice(0, n);
  return {
    headline: s(r.headline, 140), experience: s(r.experience), callCenter: s(r.callCenter), education: s(r.education), languages: s(r.languages, 100),
    skills: (Array.isArray(r.skills) ? r.skills : []).map((x) => s(x, 40)).slice(0, 6), strengths: (Array.isArray(r.strengths) ? r.strengths : []).map((x) => s(x, 120)).slice(0, 3),
    concerns: (Array.isArray(r.concerns) ? r.concerns : []).map((x) => s(x, 120)).slice(0, 3), fit: Math.max(1, Math.min(5, parseInt(r.fit, 10) || 3)), fitWhy: s(r.fitWhy, 200),
    at: new Date().toISOString(),
  };
}
