import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { dialerConfig } from "@/lib/dialer";
import { dialerSettings } from "@/lib/vicidial";
import { configFor } from "@/lib/connectors";
import { dec } from "@/lib/crypto";

// The real VICIdial agent screen, signed in as this person, to show inside Modo.
// It runs in the person's own browser, so it gets through the dialer's firewall like it always does,
// and VICIdial's own browser phone works inside it.
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [dc, vs, vici, u] = await Promise.all([dialerConfig(), dialerSettings(), configFor("vicidial"), db.user.findUnique({ where: { id: s.uid }, select: { vicidialUser: true, sipUser: true, sipPass: true } })]);
  if (!vs.agentUrl) return NextResponse.json({ error: "Admin: connect VICIdial in Dialer setup first." }, { status: 400 });
  const user = u?.vicidialUser || "";
  let phonePass = ""; try { phonePass = u?.sipPass ? dec(u.sipPass) : ""; } catch {}
  phonePass = phonePass || dc.webphone?.pass || "";
  const q = new URLSearchParams();
  if (user) {
    const phone = u?.sipUser || user;
    q.set("pl", phone); q.set("phone_login", phone);
    if (phonePass) { q.set("pp", phonePass); q.set("phone_pass", phonePass); }
    q.set("VD_login", user);
    if (dc.embed?.agentPass) q.set("VD_pass", dc.embed.agentPass);
    if (dc.embed?.campaign) q.set("VD_campaign", dc.embed.campaign);
  }
  let firewall = ""; try { const h = new URL(vici?.url || process.env.VICIDIAL_URL || vs.agentUrl).hostname; if (/dialerlab\.com/i.test(h)) firewall = `https://${h}:446/login.php`; } catch {}
  if (vici?.portal) firewall = String(vici.portal).replace(/valid8\.php$/i, "login.php");
  const url = vs.agentUrl + (q.toString() ? (vs.agentUrl.includes("?") ? "&" : "?") + q.toString() : "");
  return NextResponse.json({ url, base: vs.agentUrl, user, firewall, autoLogin: !!(user && dc.embed?.agentPass && phonePass) }, { headers: { "cache-control": "no-store" } });
}
