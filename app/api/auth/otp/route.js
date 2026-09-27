import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readTicket } from "@/lib/session";
import { finishLogin } from "@/lib/login";
import { verify } from "@/lib/totp";
import { enc, dec } from "@/lib/crypto";

const tries = new Map();

// { ticket, code }  — second step of sign-in (also finishes first-time authenticator setup)
export async function POST(req) {
  const b = await req.json();
  const t = await readTicket(b.ticket);
  if (!t) return NextResponse.json({ error: "Sign-in expired. Enter your ID and password again." }, { status: 401 });
  const n = (tries.get(t.uid) || 0) + 1; tries.set(t.uid, n);
  if (n > 10) return NextResponse.json({ error: "Too many wrong codes. Start again in a few minutes." }, { status: 429 });
  const user = await db.user.findUnique({ where: { id: t.uid } });
  if (!user || !user.active) return NextResponse.json({ error: "Account not active." }, { status: 403 });
  const secret = t.s ? dec(t.s) : dec(user.totpSecret);
  if (!verify(secret, b.code)) return NextResponse.json({ error: "That code isn't right. Check the 6 digits in your authenticator app." }, { status: 401 });
  tries.delete(t.uid);
  if (t.s) await db.user.update({ where: { id: user.id }, data: { totpSecret: enc(secret), totpEnabled: true } });
  return finishLogin(user, b);
}
