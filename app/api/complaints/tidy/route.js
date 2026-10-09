import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { askAI } from "@/lib/ai";

// Turns the agent's rough notes (typed or spoken) into a clear complaint summary for admin. Never invents facts.
export async function POST(req) {
  const { error } = await requireRole();
  if (error) return error;
  const { text } = await req.json().catch(() => ({}));
  if (!String(text || "").trim()) return NextResponse.json({ error: "Write or record something first." }, { status: 400 });
  try {
    const out = await askAI("You rewrite a call-center agent's rough notes about a customer complaint into a clear, factual summary for the manager. Plain English, 2–6 short sentences: what happened, what the customer is unhappy about, and what they want. Keep every fact, name, number and date exactly; add nothing that isn't in the notes. Return only the summary.", String(text).slice(0, 6000), { knowledge: false, maxTokens: 600 });
    return NextResponse.json({ text: out });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
