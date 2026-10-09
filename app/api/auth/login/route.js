import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, runAsOrg, validOrg } from "@/lib/db";
import { signTicket } from "@/lib/session";
import { clientIp } from "@/lib/auth";
import { getSettings, ipAllowed } from "@/lib/settings";
import { friendlyError } from "@/lib/errors";
import { finishLogin, needs2fa } from "@/lib/login";
import { lockState } from "@/lib/lock";
import { newSecret, otpauth } from "@/lib/totp";
import { enc } from "@/lib/crypto";

import { isBlocked, failed, cleared, waitText } from "@/lib/throttle";

// Brute-force protection (kept in the database, so it works on every server): 6 wrong passwords per ID, or
// 20 per network address, in 15 minutes locks that ID / address — 15 min, then 30, 60… for repeat offenders.
const BAD = { error: "Agent ID or password is wrong." };

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    // A company workspace (their own Modo) or "" for yours.
    const ws = String(body.workspace || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (ws) {
      if (!validOrg(ws)) return NextResponse.json({ error: "That workspace name isn't right. Check it on the screen where you signed up." }, { status: 400 });
      const { tenantState } = await import("@/lib/tenants");
      const st = await tenantState(ws);
      if (!st.ok) return NextResponse.json({ error: st.why }, { status: 403 });
      return await runAsOrg(ws, () => login(body, ws));
    }
    return await login(body, "");
  }
  catch (e) { console.error("Login failed:", e); return NextResponse.json({ error: friendlyError(e) }, { status: 500 }); }
}

async function login(body, ws) {
  const id = String(body.agentId || "").trim().toUpperCase().slice(0, 40);
  const pw = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const ip = clientIp() || "unknown";
  for (const k of ["login-id:" + id, "login-ip:" + ip]) {
    const b = await isBlocked(k);
    if (b.blocked) return NextResponse.json({ error: `Too many wrong tries. Try again in ${waitText(b.wait)}.` }, { status: 429 });
  }
  const user = id ? await db.user.findUnique({ where: { agentId: id } }) : null;
  // Always run bcrypt (even for an unknown ID) so the response time doesn't reveal which IDs exist.
  const ok = await bcrypt.compare(pw, user?.passwordHash || "$2a$10$CwTycUXWue0Thq9StjUM0uJ8DmRKWwVSOBtYOGqeHRIRwnD0eC0Ku");
  if (!user || !user.active || !ok) {
    await failed("login-id:" + id, { max: 6 }); await failed("login-ip:" + ip, { max: 80, baseLockMs: 10 * 60000 }); // the whole office shares one address: only a real guessing attack trips this
    return NextResponse.json(BAD, { status: 401 });
  }
  await cleared("login-id:" + id);
  const settings = await getSettings();
  if (user.role !== "ADMIN") {
    const lock = await lockState();
    if (lock.on) return NextResponse.json({ error: lock.message || "Modo is paused by admin. Try again later." }, { status: 423 });
    if (!ipAllowed(settings, clientIp())) return NextResponse.json({ error: "Sign in from the office network. This connection isn't on the allowed list." }, { status: 403 });
  }
  if (needs2fa(settings, user)) {
    if (user.totpEnabled && user.totpSecret) return NextResponse.json({ step: "otp", ticket: await signTicket({ uid: user.id, ...(ws ? { org: ws } : {}) }) });
    const secret = newSecret(); // first time: set up the authenticator app
    return NextResponse.json({ step: "enroll", ticket: await signTicket({ uid: user.id, s: enc(secret), ...(ws ? { org: ws } : {}) }), secret, uri: otpauth(secret, `${user.name} (${user.agentId})`) });
  }
  return finishLogin(user, body);
}
