import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { askFile } from "@/lib/ai";

export const maxDuration = 60; // reading a PDF/image can take a little longer

// Read an uploaded utility bill (PDF or photo) and return Budget Ease form fields.
// Body: { name, mime, data } where data is base64 (no "data:" prefix).
const OK = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"];

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  let mime = String(b.mime || "").toLowerCase();
  const data = String(b.data || "");
  if (!data) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!OK.includes(mime)) return NextResponse.json({ error: "Upload a PDF or a photo (JPG/PNG) of the bill." }, { status: 400 });
  // base64 size guard (~9 MB file)
  if (data.length > 12_000_000) return NextResponse.json({ error: "That file is too big — keep it under 9 MB (one bill)." }, { status: 400 });

  const system = "You read US utility bills and return ONLY JSON. Never guess: use \"\" or null for anything not clearly on the bill. Never return any SSN or date of birth.";
  const prompt = `From this utility bill, extract the signup details as JSON with exactly these keys:
{"customer":"account holder full name","phone":"10 digits if shown","email":"if shown","zip":"5-digit service ZIP","serviceAddress":"service street, city, state","company":"the utility company name","service":"electricity|gas|internet|water|phone|cable/TV|other","accountNumber":"the account number on the bill","billAmount":number (the current amount due / total this month),"payAmount":null,"notes":"billing period or anything useful, short"}
Return the JSON only, no commentary.`;

  try {
    const d = await askFile({ mime, dataB64: data, system, prompt, json: true });
    if (!d) return NextResponse.json({ error: "Couldn't read that bill. Try a clearer scan or type the details." }, { status: 422 });
    // Never let the model send these back into the form
    delete d.ssn4; delete d.dob; delete d.payAmount;
    return NextResponse.json(d);
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
