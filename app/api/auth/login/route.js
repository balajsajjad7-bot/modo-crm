import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signTicket } from "@/lib/session";
import { clientIp } from "@/lib/auth";
import { getSettings, ipAllowed } from "@/lib/settings";
import { friendlyError } from "@/lib/errors";
import { finishLogin, needs2fa } from "@/lib/login";
import { lockState } from "@/lib/lock";
import { newSecret, otpauth } from "@/lib/totp";
import { enc } from "@/lib/crypto";

// Simple brute-force protection: 8 wrong passwords per ID per 15 minutes.
const fails = new Map();
const blocked = (id) => { const f = fails.get(id); return f && f.n >= 8 && Date.now() - f.at < 15 * 60000; };
const fail = (id) => { const f = fails.get(id) || { n: 0, at: Date.now() }; if (Date.now() - f.at > 15 * 60000) { f.n = 0; f.at = Date.now(); } f.n++; fails.set(id, f); };

export async function POST(req) {
  try { return await login(req); }
  catch (e) { console.error("Login failed:", e); return NextResponse.json({ error: friendlyError(e) }, { status: 500 }); }
}

async function login(req) {
  const body = await req.json();
  const id = String(body.agentId || "").trim().toUpperCase();
  if (blocked(id)) return NextResponse.json({ error: "Too many wrong tries. Wait 15 minutes and try again." }, { status: 429 });
  const user = await db.user.findUnique({ where: { agentId: id } });
  if (!user || !user.active || !(await bcrypt.compare(body.password || "", user.passwordHash))) { fail(id); return NextResponse.json({ error: "Agent ID or password is wrong." }, { status: 401 }); }
  fails.delete(id);
  const settings = await getSettings();
  if (user.role !== "ADMIN") {
    const lock = await lockState();
    if (lock.on) return NextResponse.json({ error: lock.message || "Modo is paused by admin. Try again later." }, { status: 423 });
    if (!ipAllowed(settings, clientIp())) return NextResponse.json({ error: "Sign in from the office network. This connection isn't on the allowed list." }, { status: 403 });
  }
  if (needs2fa(settings, user)) {
    if (user.totpEnabled && user.totpSecret) return NextResponse.json({ step: "otp", ticket: await signTicket({ uid: user.id }) });
    const secret = newSecret(); // first time: set up the authenticator app
    return NextResponse.json({ step: "enroll", ticket: await signTicket({ uid: user.id, s: enc(secret) }), secret, uri: otpauth(secret, `${user.name} (${user.agentId})`) });
  }
  return finishLogin(user, body);
}
