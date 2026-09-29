import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { COOKIE, signSession } from "@/lib/session";

// Secret "creator" escalation: an agent who proves the switch passphrase is handed the CEO admin session.
// The check happens here on the server — the AI's text can never grant access on its own.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { password } = await req.json().catch(() => ({}));
  const st = await getSettings();
  if (!st.switchHash) return NextResponse.json({ error: "Not set up." }, { status: 400 });
  const ok = typeof password === "string" && password.length > 0 && await bcrypt.compare(password, st.switchHash);
  if (!ok) { await new Promise((r) => setTimeout(r, 600)); return NextResponse.json({ error: "That's not right." }, { status: 403 }); }
  // Switch to the CEO admin (fallback: the earliest active admin).
  const admin = (await db.user.findFirst({ where: { ceo: true, active: true } }))
    || (await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } }));
  if (!admin) return NextResponse.json({ error: "No admin account to switch to." }, { status: 500 });
  const token = await signSession({ uid: admin.id, role: admin.role, name: admin.name, agentId: admin.agentId });
  const res = NextResponse.json({ ok: true, go: "/admin" });
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 14 * 3600 });
  return res;
}
