import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth";
import { isBlocked, failed, waitText } from "@/lib/throttle";
import { addCandidate, loadHiring, attachCv } from "@/lib/hiring";
import { checkCv } from "@/lib/cv";

export const maxDuration = 60;

// Public "Apply" page → a new candidate with their own English-test link.
export async function GET() {
  const v = await loadHiring();
  return NextResponse.json({ open: v.settings.applyOpen !== false, company: v.settings.company || "Modo" });
}
export async function POST(req) {
  const key = "apply:" + (clientIp() || "?");
  const bl = await isBlocked(key);
  if (bl.blocked) return NextResponse.json({ error: `Too many applications from this connection. Try again in ${waitText(bl.wait)}.` }, { status: 429 });
  // JSON, or multipart when a resume is attached.
  let b = {}, cv = null;
  if ((req.headers.get("content-type") || "").includes("multipart")) { const f = await req.formData().catch(() => null); if (f) { for (const [k, v] of f.entries()) if (typeof v === "string") b[k] = v; cv = f.get("cv"); } }
  else b = await req.json().catch(() => ({}));
  try { checkCv(cv); } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  if (b.website) return NextResponse.json({ ok: true }); // honeypot
  const v = await loadHiring();
  if (v.settings.applyOpen === false) return NextResponse.json({ error: "Applications are closed right now." }, { status: 403 });
  if (!String(b.name || "").trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email || "").trim()) || String(b.phone || "").replace(/\D/g, "").length < 7) return NextResponse.json({ error: "Add your full name, email and phone number." }, { status: 400 });
  if (v.candidates.some((c) => c.email && c.email.toLowerCase() === String(b.email).trim().toLowerCase() && Date.now() - new Date(c.createdAt) < 30 * 86400000)) return NextResponse.json({ error: "You've already applied with this email. Check your test link, or ask the recruiter." }, { status: 409 });
  await failed(key, { max: 4, windowMs: 3600000, baseLockMs: 3600000 });
  try {
    const c = await addCandidate({ name: b.name, email: b.email, phone: b.phone, track: b.track, position: b.track === "outreach" ? "Outreach agent" : "Customer service agent", notes: String(b.experience || "").slice(0, 500) }, "apply");
    let cvErr = "";
    if (cv && typeof cv === "object" && cv.size) { try { await attachCv(c.id, cv); } catch (e) { cvErr = e.message; } }
    try { const { alert } = await import("@/lib/bots"); await alert("hire-apply-" + c.id, `🧑‍💼 New job application: ${c.name} (${c.track === "outreach" ? "Outreaching" : "Customer service"}). They're taking the English test now. Team → Hiring & interviews.`, { wa: false }); } catch {}
    return NextResponse.json({ ok: true, token: c.token, cvErr });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
