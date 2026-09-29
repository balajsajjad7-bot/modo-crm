import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

// The signed-in agent's own welcome + confidential contract.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const u = await db.user.findUnique({ where: { id: s.uid }, select: { name: true, contract: true, onboardedAt: true, role: true } });
  const st = await getSettings();
  return NextResponse.json({
    name: u?.name || s.name,
    message: st.onboardMsg || "",
    contract: u?.contract || "",
    acknowledged: !!u?.onboardedAt,
    needsWelcome: u?.role === "AGENT" && !u?.onboardedAt && !!(st.onboardMsg || u?.contract),
  });
}

// Agent acknowledges the welcome/contract.
export async function POST() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await db.user.update({ where: { id: s.uid }, data: { onboardedAt: new Date() } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
