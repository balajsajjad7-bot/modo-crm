import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { configFor } from "@/lib/connectors";

// ICE servers for WebRTC voice (huddles + supervisor listen-in).
// STUN alone only works when both sides can reach each other directly (same network). Across the
// internet / mobile data you need a TURN relay to actually carry the audio, or the call connects but is silent.
export async function GET() {
  if (!(await currentUser())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const servers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
  ];

  // 1) Your own TURN (Tools → Connectors → TURN, or .env) takes priority — most reliable.
  const t = (await configFor("turn")) || { url: process.env.TURN_URL, user: process.env.TURN_USER, pass: process.env.TURN_PASS };
  if (t.url) {
    servers.push({ urls: t.url.split(",").map((u) => u.trim()).filter(Boolean), username: t.user, credential: t.pass });
  } else {
    // 2) Free public fallback (OpenRelay by Metered) so voice works across networks out of the box.
    //    UDP, TCP and TLS/443 variants so it also gets through strict firewalls.
    servers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:80?transport=tcp",
        "turn:openrelay.metered.ca:443",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }
  return NextResponse.json({ iceServers: servers }, { headers: { "cache-control": "no-store" } });
}
