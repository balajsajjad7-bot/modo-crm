import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

// Append a call-back note to a sale (what the agent discussed). Server stamps the time + who,
// so the log can't be back-dated. POST { id, text }.
export async function POST(req) {
  const { session, error } = await requireManager("sales");
  if (error) return error;
  const { id, text } = await req.json().catch(() => ({}));
  const t = String(text || "").trim().slice(0, 1000);
  if (!id || !t) return NextResponse.json({ error: "Nothing to log." }, { status: 400 });
  const s = await db.sale.findUnique({ where: { id: String(id) }, select: { notes: true } });
  if (!s) return NextResponse.json({ error: "That sale doesn't exist any more." }, { status: 404 });
  const stamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const line = `[${stamp}${session?.name ? " · " + session.name : ""}] ${t}`;
  const notes = (s.notes ? `${line}\n${s.notes}` : line).slice(0, 8000);
  await db.sale.update({ where: { id: String(id) }, data: { notes } }).catch(() => {});
  return NextResponse.json({ ok: true, notes });
}
