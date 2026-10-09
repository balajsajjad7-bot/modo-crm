import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { transcribe } from "@/lib/transcribe";

export const maxDuration = 60;
// Voice → text: the admin records a speech, an agent records a practice pitch or a complaint.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await req.formData();
  try { return NextResponse.json({ text: await transcribe(form.get("audio")) }); }
  catch (e) { return NextResponse.json({ error: e.message + (e.noKey ? " You can still type it." : "") }, { status: e.status || 502 }); }
}
