import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { askAI } from "@/lib/ai";

// Translate a batch of UI strings into the chosen language (used by the live in-app translator).
const NAMES = { ur: "Urdu", hi: "Hindi", ar: "Arabic", es: "Spanish", fr: "French", pt: "Portuguese", bn: "Bengali", pa: "Punjabi", fa: "Persian/Farsi", ps: "Pashto", tr: "Turkish", id: "Indonesian", fil: "Filipino", zh: "Chinese (Simplified)", ru: "Russian", de: "German" };

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { lang, texts } = await req.json().catch(() => ({}));
  const list = Array.isArray(texts) ? texts.slice(0, 60).map((t) => String(t || "")) : [];
  if (!lang || lang === "en" || !list.length) return NextResponse.json({ t: [] });
  const langName = NAMES[lang] || lang;
  const sys = `You translate short UI labels for a call-center web app into ${langName}.
Return ONLY JSON: {"t":[...]} with EXACTLY ${list.length} strings, in the same order as given.
Rules: translate naturally and concisely (these are buttons, menu items, headings).
Keep unchanged: numbers, prices, dates, times, phone numbers, ZIP codes, email addresses, URLs, IDs/codes, and brand or product names (Verizon, AT&T, UPS, Budget Ease, VICIdial, Modo, etc.).
If a string is only a number/code/brand, return it unchanged.`;
  try {
    const out = await askAI(sys, JSON.stringify(list), { json: true, knowledge: false, maxTokens: 2500 });
    let arr = Array.isArray(out?.t) ? out.t : Array.isArray(out) ? out : [];
    arr = arr.map((x) => (x == null ? "" : String(x)));
    if (arr.length !== list.length) return NextResponse.json({ t: [] }); // mismatch — skip rather than corrupt the UI
    return NextResponse.json({ t: arr });
  } catch (e) { return NextResponse.json({ t: [], error: e.message }); }
}
