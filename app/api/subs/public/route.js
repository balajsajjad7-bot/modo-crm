import { NextResponse } from "next/server";
import { publicPlans, requestSub, upsertSub } from "@/lib/subs";

export const maxDuration = 60;
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
    const s = await requestSub(b);
    // Their own Modo, ready now: database + admin and agent logins (shown once on their screen).
    let ws = null, wsErr = "";
    const { canProvision, provisionWorkspace } = await import("@/lib/tenants");
    if (canProvision()) {
      const wsKey = "ws-create:" + ip; const wb = await isBlocked(wsKey);
      if (wb.blocked) wsErr = "This connection already created workspaces today.";
      else {
        await failed(wsKey, { max: 2, windowMs: 24 * 3600000, baseLockMs: 24 * 3600000 }); // 2 new workspaces a day per connection
        try {
          ws = await provisionWorkspace({ company: b.company, contact: b.contact, email, phone: b.phone, plan: s.plan, seats: b.seats });
          await upsertSub({ id: s.id, status: ws.trialEnds ? "trial" : "active", workspace: ws.org, seats: ws.users.length, ...(ws.trialEnds ? { renewsAt: ws.trialEnds } : {}) }, "Website sign-up");
        } catch (e) { wsErr = e.message; }
      }
    }
    try {
      const { alert } = await import("@/lib/bots");
      const who = `${String(b.company).slice(0, 60)} (${String(b.contact).slice(0, 40)}, ${email}${b.phone ? ", " + String(b.phone).slice(0, 30) : ""})`;
      await alert("subreq:" + s.id, ws
        ? `🎉 New company signed up: ${who}\n🏢 Workspace "${ws.org}" is live on ${s.plan}${ws.trialEnds ? ` — free trial until ${new Date(ws.trialEnds).toDateString()}` : ""}\n👥 ${ws.users.length} logins created (1 admin + ${ws.users.length - 1} agents) and shown to them\nAdmin → Subscriptions to manage it.`
        : `🧾 New Modo plan request: ${who} wants ${s.plan} (${s.seats} users).${wsErr ? `\n⚠️ Automatic setup didn't run: ${wsErr}` : ""}\nOpen Admin → Subscriptions to activate.`);
    } catch {}
    if (ws) return NextResponse.json({ ok: true, workspace: { org: ws.org, plan: s.plan, trialEnds: ws.trialEnds, loginPath: "/login?w=" + ws.org, users: ws.users.map((u) => ({ role: u.role, id: u.id, name: u.name, password: u.password })) } });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 429 }); }
}
