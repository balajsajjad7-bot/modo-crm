import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { dialerConfig } from "@/lib/dialer";
import { configFor } from "@/lib/connectors";
import { dec } from "@/lib/crypto";

// The signed-in person's Modo browser phone settings (their own VICIdial phone login).
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [dc, vici, u] = await Promise.all([dialerConfig(), configFor("vicidial"), db.user.findUnique({ where: { id: s.uid }, select: { vicidialUser: true, sipUser: true, sipPass: true, name: true } })]);
  const wp = dc.webphone || {};
  if (wp.on === false) return NextResponse.json({ off: true });
  let host = ""; try { host = new URL(vici?.url || process.env.VICIDIAL_URL || "").hostname; } catch {}
  const user = u?.sipUser || u?.vicidialUser || "";
  let pass = ""; try { pass = u?.sipPass ? dec(u.sipPass) : ""; } catch {}
  pass = pass || wp.pass || "";
  if (!host && !wp.wss) return NextResponse.json({ setup: "Admin: connect VICIdial in Dialer setup first." });
  if (!user || !pass) return NextResponse.json({ setup: "Admin: set your phone login and password in Dialer setup → Modo phone." });
  return NextResponse.json({
    wss: wp.wss || `wss://${host}:8089/ws`, domain: wp.domain || host, user, pass, name: u?.name || user,
    prefix: wp.prefix ?? "9", autoAnswer: wp.autoAnswer !== false,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  }, { headers: { "cache-control": "no-store" } });
}
