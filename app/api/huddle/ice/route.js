import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { configFor } from "@/lib/connectors";
// STUN is free and enough for most networks. For strict office firewalls add a TURN server in .env.
export async function GET() {
  if (!(await currentUser())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const servers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const t = (await configFor("turn")) || { url: process.env.TURN_URL, user: process.env.TURN_USER, pass: process.env.TURN_PASS };
  if (t.url) servers.push({ urls: t.url.split(",").map((u) => u.trim()), username: t.user, credential: t.pass });
  return NextResponse.json({ iceServers: servers });
}
