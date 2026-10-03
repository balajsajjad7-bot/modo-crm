import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdminOnly, currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

// GET: is a demolish key set?  (admin/CEO only)
export async function GET() {
  const { error } = await requireAdminOnly();
  if (error) return error;
  const st = await getSettings();
  return NextResponse.json({ keySet: !!st.demolishHash });
}

// PATCH { newKey }: set/replace the demolish key (CEO only, min 8 chars).
export async function PATCH(req) {
  const { session, error } = await requireAdminOnly();
  if (error) return error;
  const me = await db.user.findUnique({ where: { id: session.uid }, select: { ceo: true } });
  if (!me?.ceo) return NextResponse.json({ error: "Only the owner (CEO account) can set the demolish key." }, { status: 403 });
  const { newKey } = await req.json();
  if (!newKey || String(newKey).length < 8) return NextResponse.json({ error: "Key must be at least 8 characters." }, { status: 400 });
  await db.setting.update({ where: { id: "global" }, data: { demolishHash: await bcrypt.hash(String(newKey), 10) } });
  return NextResponse.json({ ok: true });
}

// POST { key, confirm }: WIPE all operational data. Requires the demolish key + confirm === "DEMOLISH".
const WIPE = [
  "recordingQa", "listenRequest", "shiftEndRequest", "geoEvent", "vaultMsg", "pushSub",
  "message", "convMember", "huddleParticipant", "huddle", "conversation",
  "crmActivity", "task", "callSession", "sale", "beSale", "contact",
  "breakLog", "attendance", "adjustment", "agentNote",
];

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const me = await db.user.findUnique({ where: { id: s.uid }, select: { ceo: true, role: true } });
  if (!me?.ceo) return NextResponse.json({ error: "Only the owner (CEO account) can demolish Modo." }, { status: 403 });
  const { key, confirm } = await req.json();
  if (confirm !== "DEMOLISH") return NextResponse.json({ error: 'Type DEMOLISH to confirm.' }, { status: 400 });
  const st = await getSettings();
  if (!st.demolishHash) return NextResponse.json({ error: "No demolish key is set. Set one first." }, { status: 400 });
  if (!(await bcrypt.compare(String(key || ""), st.demolishHash))) return NextResponse.json({ error: "Wrong demolish key." }, { status: 403 });

  const wiped = {};
  for (const model of WIPE) {
    try { const r = await db[model].deleteMany({}); wiped[model] = r.count; } catch { /* table may not exist */ }
  }
  // Remove every user except the CEO owner, and clear connectors (API keys).
  try { await db.user.deleteMany({ where: { ceo: false } }); } catch {}
  try { await db.connector.deleteMany({}); } catch {}
  return NextResponse.json({ ok: true, wiped });
}
