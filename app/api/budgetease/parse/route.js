import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { askAI } from "@/lib/ai";

// AI auto-fill for the Budget Ease form. SSN and date of birth are removed BEFORE the text goes to the AI.
const strip = (t) => String(t || "")
  .replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, "[removed]")
  .replace(/\b(ssn|social|last ?4|last four)[^\n]{0,20}?\d{4}\b/gi, "[removed]")
  .replace(/\b(dob|born|birth(day)?|date of birth)[^\n]{0,15}?\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}\b/gi, "[removed]");

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { text } = await req.json();
  if (!String(text || "").trim()) return NextResponse.json({ error: "Paste your call notes first." }, { status: 400 });
  try {
    const r = await askAI(`Extract Budget Ease (US utility-bill discount) signup details from an agent's notes. Return JSON only with these keys (use "" or null when unknown, never guess):
{"customer":"full name","phone":"10 digits","email":"","zip":"5 digits","serviceAddress":"street, city, state","company":"utility company name","service":"electricity|gas|internet|water|phone|cable/TV|other","billAmount":number,"payAmount":number,"notes":"anything else useful, short"}
billAmount is the customer's current monthly bill; payAmount is what they want to pay each month.`, strip(text).slice(0, 4000), { json: true });
    return NextResponse.json(r || {});
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
