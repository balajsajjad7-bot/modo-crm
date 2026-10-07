import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, clientIp } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { signStatus, saveSign, contractHash } from "@/lib/contractSign";

// The signed-in agent's own welcome + confidential contract (+ whether they've signed it).
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const u = await db.user.findUnique({ where: { id: s.uid }, select: { name: true, contract: true, onboardedAt: true, role: true } });
  const st = await getSettings();
  const sign = await signStatus(s.uid, u?.contract);
  return NextResponse.json({
    name: u?.name || s.name,
    message: st.onboardMsg || "",
    contract: u?.contract || "",
    acknowledged: !!u?.onboardedAt,
    sign,
    // Agents see the pop-up until they've signed their contract (or, without a contract, read the welcome once).
    needsWelcome: u?.role === "AGENT" && (sign.required ? !sign.signed : !u?.onboardedAt && !!st.onboardMsg),
  });
}

// {} → read & understood (welcome only) · { sign: { name, image } } → sign the contract
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.sign) {
    const u = await db.user.findUnique({ where: { id: s.uid }, select: { name: true, contract: true } });
    if (!u?.contract) return NextResponse.json({ error: "There's no contract to sign yet." }, { status: 400 });
    const name = String(b.sign.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 3) return NextResponse.json({ error: "Type your full name." }, { status: 400 });
    const image = String(b.sign.image || "");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length < 800 || image.length > 300000) return NextResponse.json({ error: "Draw your signature in the box." }, { status: 400 });
    await saveSign(s.uid, { name, image, at: new Date().toISOString(), ip: clientIp() || "", hash: contractHash(u.contract), ua: (req.headers.get("user-agent") || "").slice(0, 160) });
    await db.user.update({ where: { id: s.uid }, data: { onboardedAt: new Date() } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  await db.user.update({ where: { id: s.uid }, data: { onboardedAt: new Date() } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
