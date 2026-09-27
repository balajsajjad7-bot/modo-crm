import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { askAI } from "@/lib/ai";

// Agent pastes messy notes; AI fills the sale form fields (agent still reviews before sending).
const SYS = `Extract sale details from the agent's notes. Return JSON only with these keys (null when unknown):
{"customer":string,"phone":string,"email":string,"address":string,"zip":string,"orderNumber":string,"discountPct":number,"billBefore":number,
"billAfter":number,"nextBillDate":"YYYY-MM-DD","lines":number,"overcharged":number,"device":string,"deviceColor":string,"storage":string,"specs":string,"gift":string,"locationCode":string}
Money as plain numbers (no $). Never invent values.`;
export async function POST(req) {
  const { error } = await requireRole("AGENT");
  if (error) return error;
  const { text } = await req.json();
  if (!String(text || "").trim()) return NextResponse.json({ error: "Paste the notes first." }, { status: 400 });
  try { const f = await askAI(SYS, String(text).slice(0, 8000), { json: true }); return NextResponse.json(f || {}); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
