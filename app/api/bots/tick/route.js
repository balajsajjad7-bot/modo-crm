import { NextResponse } from "next/server";
import { runBots } from "@/lib/bots";
import { currentUser } from "@/lib/auth";
import { once } from "@/lib/throttle";

export const maxDuration = 60;

// Automatic tick: every open Modo calls this every ~2 minutes, plus the GitHub heartbeat. Runs the
// briefing, callback, sales-checker and attendance bots. Safe to call by anyone: returns status only.
export async function GET() {
  // Signed-in pages tick freely; anonymous calls (the GitHub heartbeat, or anyone else) at most once a minute.
  if (!(await currentUser()) && !(await once("bots-tick", 60000))) return NextResponse.json({ ok: true, skipped: true });
  try { const r = await runBots(); return NextResponse.json({ ok: r.ok, skipped: !!r.skipped, bots: r.bots ? Object.keys(r.bots).length : 0 }); }
  catch { return NextResponse.json({ ok: false }); }
}
