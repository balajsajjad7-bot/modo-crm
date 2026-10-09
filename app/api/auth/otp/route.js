import { NextResponse } from "next/server";
import { db, runAsOrg, validOrg } from "@/lib/db";
import { readTicket } from "@/lib/session";
import { finishLogin } from "@/lib/login";
import { verify } from "@/lib/totp";
import { enc, dec } from "@/lib/crypto";

import { isBlocked, failed, cleared, waitText } from "@/lib/throttle";

// { ticket, code }  — second step of sign-in (also finishes first-time authenticator setup)
export async function POST(req) {
  const b = await req.json();
  const t = await readTicket(b.ticket);
  if (!t) return NextResponse.json({ error: "Sign-in expired. Enter your ID and password again." }, { status: 401 });
  if (t.org) {
    if (!validOrg(t.org)) return NextResponse.json({ error: "Sign-in expired." }, { status: 401 });
    const { tenantState } = await import("@/lib/tenants"); const st = await tenantState(t.org);
    if (!st.ok) return NextResponse.json({ error: st.why }, { status: 403 });
    return runAsOrg(t.org, () => otp(b, t));
  }
  return otp(b, t);
}
async function otp(b, t) {
  const bl = await isBlocked("otp:" + t.uid);
  if (bl.blocked) return NextResponse.json({ error: `Too many wrong codes. Try again in ${waitText(bl.wait)}.` }, { status: 429 });
  const user = await db.user.findUnique({ where: { id: t.uid } });
  if (!user || !user.active) return NextResponse.json({ error: "Account not active." }, { status: 403 });
  const secret = t.s ? dec(t.s) : dec(user.totpSecret);
  if (!verify(secret, b.code)) { await failed("otp:" + t.uid, { max: 6 }); return NextResponse.json({ error: "That code isn't right. Check the 6 digits in your authenticator app." }, { status: 401 }); }
  await cleared("otp:" + t.uid);
  if (t.s) await db.user.update({ where: { id: user.id }, data: { totpSecret: enc(secret), totpEnabled: true } });
  return finishLogin(user, b);
}
