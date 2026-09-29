import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { dialerConfig, customCall } from "@/lib/dialer";
import { agentApi } from "@/lib/vicidial";

// Agent sets their own status: available | away | busy.
// This also drives the dialer: Away/Busy pauses it, Available makes it ready again.
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { status } = await req.json();
  if (!["available", "away", "busy"].includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  await db.user.update({ where: { id: s.uid }, data: { status, statusAt: new Date() } });

  // Mirror the status onto the linked dialer (best-effort — never block the status change).
  let dialer = null;
  try {
    const u = await db.user.findUnique({ where: { id: s.uid }, select: { vicidialUser: true } });
    const vu = u?.vicidialUser;
    if (vu) {
      const dc = await dialerConfig();
      const pause = status !== "available";
      const code = status === "busy" ? "BUSY" : "AWAY";
      if (dc.provider === "vicidial") {
        await agentApi("external_pause", vu, { value: pause ? "PAUSE" : "RESUME" });
        if (pause) await agentApi("pause_code", vu, { value: code }).catch(() => {});
        dialer = pause ? "paused" : "ready";
      } else if (dc.provider === "custom") {
        await customCall(dc, pause ? "pause" : "resume", { agent: vu, code }).catch(() => {});
        dialer = pause ? "paused" : "ready";
      }
    }
  } catch { /* dialer not reachable / not on a pausable state — status still saved */ }

  return NextResponse.json({ ok: true, status, dialer });
}
