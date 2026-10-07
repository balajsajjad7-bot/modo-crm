import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { WA_COOKIE, WA_MAX, signWaPass } from "@/lib/session";
import { lockInfo, setLock, checkLock, strongEnough, waOpen } from "@/lib/waLock";
import { isBlocked, failed, cleared, waitText } from "@/lib/throttle";
import { alertAdminsWA } from "@/lib/whatsapp";

const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: WA_MAX };
const nope = (msg, status = 403) => NextResponse.json({ error: msg }, { status });

// WhatsApp password status for the signed-in admin.
export async function GET() {
  const s = await currentUser();
  if (!s || s.role !== "ADMIN") return nope("Only an admin can open WhatsApp.");
  const o = await waOpen(s);
  const bl = await isBlocked("wa-unlock:" + s.uid);
  return NextResponse.json({ set: o.set, unlocked: o.ok, until: o.ok && o.exp ? o.exp * 1000 : null, blockedFor: bl.blocked ? bl.wait : 0 });
}

// { action: "set", password, current? }  first time, or change (needs the current one)
// { action: "unlock", password }          → 30-minute pass
// { action: "lock" }                      → lock now
// { action: "reset", loginPassword, password } → forgot it: prove it's you with your Modo login password
export async function POST(req) {
  const s = await currentUser();
  if (!s || s.role !== "ADMIN") return nope("Only an admin can open WhatsApp.");
  const b = await req.json().catch(() => ({}));
  const key = "wa-unlock:" + s.uid;
  const issue = async (v, body = { ok: true }) => {
    const res = NextResponse.json(body);
    res.cookies.set(WA_COOKIE, await signWaPass({ uid: s.uid, v: v.ver }), cookieOpts);
    return res;
  };

  if (b.action === "lock") { const res = NextResponse.json({ ok: true }); res.cookies.set(WA_COOKIE, "", { ...cookieOpts, maxAge: 0 }); return res; }

  // Every action below checks a secret, so all share one throttle.
  const bl = await isBlocked(key);
  if (bl.blocked) return nope(`Too many wrong tries — WhatsApp is locked for ${waitText(bl.wait)}.`, 429);
  const wrong = async (msg) => {
    const r = await failed(key, { max: 5 });
    if (r.locked) alertAdminsWA(`🔐 WhatsApp in Modo was locked for ${waitText(r.wait)} after wrong passwords from ${s.name || "an admin account"}. If that wasn't you, change your Modo password now.`).catch(() => {});
    return nope(r.locked ? `Too many wrong tries — WhatsApp is locked for ${waitText(r.wait)}.` : `${msg} ${r.left} ${r.left === 1 ? "try" : "tries"} left.`, r.locked ? 429 : 401);
  };
  const cur = await lockInfo();

  if (b.action === "set") {
    if (cur && !(await checkLock(b.current))) return wrong("Your current WhatsApp password isn't right.");
    const weak = strongEnough(b.password); if (weak) return nope(weak, 400);
    const v = await setLock(String(b.password));
    await cleared(key);
    await db.message.create({ data: { conversationId: "modo-bot", userId: "system", kind: "SYSTEM", text: `🔐 ${s.name} ${cur ? "changed" : "set"} the WhatsApp password.` } }).catch(() => {});
    return issue(v, { ok: true, set: true });
  }
  if (b.action === "unlock") {
    if (!cur) return nope("Set a WhatsApp password first.", 400);
    const v = await checkLock(b.password);
    if (!v) return wrong("Wrong WhatsApp password.");
    await cleared(key);
    return issue(v, { ok: true, until: Date.now() + WA_MAX * 1000 });
  }
  if (b.action === "reset") {
    const u = await db.user.findUnique({ where: { id: s.uid }, select: { passwordHash: true } });
    if (!u || !(await bcrypt.compare(String(b.loginPassword || "").slice(0, 200), u.passwordHash))) return wrong("Your Modo login password isn't right.");
    const weak = strongEnough(b.password); if (weak) return nope(weak, 400);
    const v = await setLock(String(b.password));
    await cleared(key);
    alertAdminsWA(`🔐 The WhatsApp password in Modo was reset by ${s.name}. If that wasn't you, change your Modo password now.`).catch(() => {});
    return issue(v, { ok: true, set: true });
  }
  return nope("Unknown action.", 400);
}
