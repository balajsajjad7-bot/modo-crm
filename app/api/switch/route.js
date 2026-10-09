import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { COOKIE, signSession } from "@/lib/session";
import { isBlocked, failed, cleared, waitText } from "@/lib/throttle";
import { alertAdminsWA } from "@/lib/whatsapp";

// Secret "creator" escalation: an agent who proves the switch passphrase is handed the CEO admin session.
// The check happens here on the server — the AI's text can never grant access on its own.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { password } = await req.json().catch(() => ({}));
  const st = await getSettings();
  if (!st.switchHash) return NextResponse.json({ error: "Not set up." }, { status: 400 });
  // 3 wrong tries per account (and 6 for everyone together) locks the switch — 30 min, then 1 h, 2 h… — and the admin is told.
  for (const k of ["switch:" + s.uid, "switch:all"]) { const bl = await isBlocked(k); if (bl.blocked) return NextResponse.json({ error: `Locked. Try again in ${waitText(bl.wait)}.` }, { status: 429 }); }
  const ok = typeof password === "string" && password.length > 0 && password.length < 200 && await bcrypt.compare(password, st.switchHash);
  if (!ok) {
    const r = await failed("switch:" + s.uid, { max: 3, baseLockMs: 30 * 60000 }); await failed("switch:all", { max: 6, baseLockMs: 30 * 60000 });
    alertAdminsWA(`🔐 Wrong secret passphrase tried by ${s.name || s.uid} (${s.agentId || s.role})${r.locked ? " — locked now" : ""}.`).catch(() => {});
    await new Promise((x) => setTimeout(x, 600)); return NextResponse.json({ error: "That's not right." }, { status: 403 });
  }
  await cleared("switch:" + s.uid);
  // Switch to the CEO admin (fallback: the earliest active admin).
  const admin = (await db.user.findFirst({ where: { ceo: true, active: true } }))
    || (await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } }));
  if (!admin) return NextResponse.json({ error: "No admin account to switch to." }, { status: 500 });
  const token = await signSession({ uid: admin.id, role: admin.role, name: admin.name, agentId: admin.agentId, ...(s.org ? { org: s.org } : {}) });
  const res = NextResponse.json({ ok: true, go: "/admin" });
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
  return res;
}
