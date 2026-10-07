import { NextResponse } from "next/server";
import { publicPlans, requestSub } from "@/lib/subs";
import { clientIp } from "@/lib/auth";
import { failed, isBlocked, waitText } from "@/lib/throttle";

// Public pricing for the /welcome page, and "Get started" requests (land as pending for the admin to approve).
export async function GET() {
  return NextResponse.json({ plans: await publicPlans() });
}
export async function POST(req) {
  const ip = clientIp() || "unknown";
  const key = "subreq:" + ip;
  const bl = await isBlocked(key);
  if (bl.blocked) return NextResponse.json({ error: `Too many requests. Try again in ${waitText(bl.wait)}.` }, { status: 429 });
  await failed(key, { max: 5, windowMs: 60 * 60000, baseLockMs: 60 * 60000 }); // max 5 requests an hour per connection
  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true }); // honeypot: bots fill hidden fields
  const email = String(b.email || "").trim();
  if (!String(b.company || "").trim() || !String(b.contact || "").trim()) return NextResponse.json({ error: "Add your company and your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Add a valid email." }, { status: 400 });
  try {
    await requestSub(b);
    try { const { alert } = await import("@/lib/bots"); await alert("subreq:" + Date.now(), `🧾 New Modo plan request: ${String(b.company).slice(0, 60)} wants ${String(b.plan || "starter")} (${parseInt(b.seats, 10) || 1} users). Open Admin → Subscriptions to activate.`); } catch {}
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 429 }); }
}
