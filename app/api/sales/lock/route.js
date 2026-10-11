import { NextResponse } from "next/server";
import { requireRole, requireAdminOnly } from "@/lib/auth";
import { saleLock, setSalePassword, setSaleBlocked } from "@/lib/saleLock";

// Agent: does submitting need the sale password / is it off for me?  Admin: the whole picture.
export async function GET() {
  const { error, session } = await requireRole();
  if (error) return error;
  const v = await saleLock();
  if (session.role === "AGENT") return NextResponse.json({ needPassword: !!v.pw, off: v.blocked.includes(session.uid) });
  const { db } = await import("@/lib/db");
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true } });
  return NextResponse.json({ needPassword: !!v.pw, off: false, hasPassword: !!v.pw, setAt: v.pw?.setAt || null, blocked: v.blocked, agents });
}
// Admin: { action: "password", password } | { action: "clearPassword" } | { action: "agent", uid, off }
export async function POST(req) {
  const { error } = await requireAdminOnly();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  if (b.action === "password") {
    const pw = String(b.password || "");
    if (pw.length < 4 || pw.length > 100) return NextResponse.json({ error: "Use 4 to 100 characters." }, { status: 400 });
    await setSalePassword(pw); return NextResponse.json({ ok: true });
  }
  if (b.action === "clearPassword") { await setSalePassword(null); return NextResponse.json({ ok: true }); }
  if (b.action === "agent") return NextResponse.json({ ok: true, blocked: await setSaleBlocked(String(b.uid || ""), !!b.off) });
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
