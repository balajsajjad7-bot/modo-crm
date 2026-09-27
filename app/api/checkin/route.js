import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { currentUser, clientIp } from "@/lib/auth";
import { clockIn, kioskValid } from "@/lib/presence";
import { dur } from "@/lib/fmt";

// Office check-in: scan the kiosk QR with your phone, or type your ID + password on the kiosk screen.
// { t } with an agent session (phone already signed in)  |  { t, agentId, password } (phone not signed in)
// { kiosk: true, agentId, password } from the kiosk itself (kiosk is signed in as admin)
export async function POST(req) {
  const s = await currentUser();
  const b = await req.json().catch(() => ({}));
  const fromKiosk = b.kiosk && s?.role === "ADMIN";
  if (!fromKiosk && !kioskValid(b.t)) return NextResponse.json({ error: "This QR code has expired. Scan the code on the office screen again." }, { status: 400 });
  let user = null;
  if (b.agentId) {
    user = await db.user.findUnique({ where: { agentId: String(b.agentId).trim().toUpperCase() } });
    if (!user || !user.active || !(await bcrypt.compare(b.password || "", user.passwordHash))) return NextResponse.json({ error: "Agent ID or password is wrong." }, { status: 401 });
  } else if (s?.role === "AGENT") {
    user = await db.user.findUnique({ where: { id: s.uid } });
  } else return NextResponse.json({ error: "Enter your Agent ID and password." }, { status: 401 });
  if (user.role !== "AGENT") return NextResponse.json({ error: "Only agents check in." }, { status: 400 });
  const { attendance, created } = await clockIn(user, { source: fromKiosk ? "kiosk" : "qr", ip: clientIp(), location: "office" });
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  return NextResponse.json({
    name: user.name, created, at: attendance.clockIn,
    message: created ? (attendance.lateSeconds ? `Checked in, ${dur(attendance.lateSeconds)} late.` : "Checked in on time. Have a great shift!") : "You're already checked in for this shift.",
  });
}
