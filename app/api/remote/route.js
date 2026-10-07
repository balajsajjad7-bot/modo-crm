import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireAdminOnly } from "@/lib/auth";
import { COMMANDS, sendCommand, snapshot } from "@/lib/remote";

// Admin → Team → Remote control: every agent live (online, page, idle, break, locked) + commands.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const agents = await db.user.findMany({ where: { role: "AGENT", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, agentId: true, lastSeenAt: true, idleSince: true, status: true } });
  const open = await db.breakLog.findMany({ where: { end: null, userId: { in: agents.map((a) => a.id) } }, select: { userId: true, start: true } });
  const snap = await snapshot(agents.map((a) => a.id));
  return NextResponse.json({ agents: agents.map((a) => ({ ...a, onBreak: open.find((b) => b.userId === a.id)?.start || null, ...snap[a.id] })) });
}
// { to: [uid…] | "all", type, text?, url?, status? }
export async function POST(req) {
  const { error, session } = await requireAdminOnly();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  if (!COMMANDS.includes(b.type)) return NextResponse.json({ error: "Unknown command." }, { status: 400 });
  if (b.type === "open" && !/^\/agent(\/[\w\-/]*)?$/.test(String(b.url || ""))) return NextResponse.json({ error: "Pick a Modo agent page." }, { status: 400 });
  const ids = b.to === "all" ? (await db.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true } })).map((u) => u.id) : (Array.isArray(b.to) ? b.to.map(String).slice(0, 200) : []);
  if (!ids.length) return NextResponse.json({ error: "Pick at least one agent." }, { status: 400 });
  for (const uid of ids) await sendCommand(uid, b, session.name || "Admin");
  return NextResponse.json({ ok: true, sent: ids.length });
}
