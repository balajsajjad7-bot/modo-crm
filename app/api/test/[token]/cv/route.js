import { NextResponse } from "next/server";
import { guard } from "@/lib/testGuard";
import { attachCv } from "@/lib/hiring";

export const maxDuration = 60;
// Candidate sends their resume from their test link.
export async function POST(req, { params }) {
  const r = await guard(params.token); if (r.error) return r.error;
  if (r.c.cv && Date.now() - new Date(r.c.cv.at) < 60000) return NextResponse.json({ error: "Please wait a minute before uploading again." }, { status: 429 });
  try {
    const f = await req.formData();
    const out = await attachCv(r.c.id, f.get("file"));
    return NextResponse.json({ ok: true, name: out.info.name });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
