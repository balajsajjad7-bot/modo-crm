import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { dialerConfig } from "@/lib/dialer";
import { dialerSettings, portalForm } from "@/lib/vicidial";
import { configFor } from "@/lib/connectors";
import { dec } from "@/lib/crypto";

let _form = null; // the firewall page's form (action + field names), read once an hour

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
  // Firewall sign-in from the person's own browser (dialerlab lets a device in after a login on its :446 page).
  // Uses the agent's own VICIdial login, the same one the screen signs in with, so nothing extra is shared.
  let fw = null;
  if (firewall && user && dc.embed?.agentPass) {
    const loginUrl = firewall.replace(/valid8\.php$/i, "login.php");
    if (!_form || _form.loginUrl !== loginUrl || Date.now() - _form.at > 3600000) {
      try { const f = await Promise.race([portalForm(loginUrl), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 3500))]); _form = { loginUrl, at: Date.now(), f }; }
      catch { _form = { loginUrl, at: Date.now() - 3000000, f: null }; }
    }
    const f = _form.f || { url: loginUrl.replace(/login\.php$/i, "valid8.php"), method: "POST", userField: "user", passField: "pass", hidden: [] };
    const fields = {}; (f.hidden || []).forEach((h) => (fields[h.name] = h.value)); fields[f.userField] = user; fields[f.passField] = dc.embed.agentPass;
    fw = { action: f.url, method: f.method || "POST", fields };
  }
  const missing = [];
  if (!user) missing.push("your VICIdial user isn't linked to your Modo login (Dialer setup → Agents)");
  if (user && !dc.embed?.agentPass) missing.push("the agent password isn't saved (Dialer setup → VICIdial screen)");
  if (user && !phonePass) missing.push("your phone password isn't saved (Dialer setup → Phones)");
  if (user && !dc.embed?.campaign) missing.push("no campaign chosen (Dialer setup → VICIdial screen), so VICIdial asks you to pick one");
  const url = vs.agentUrl + (q.toString() ? (vs.agentUrl.includes("?") ? "&" : "?") + q.toString() : "");
  return NextResponse.json({ url, base: vs.agentUrl, user, firewall, fw, missing, role: s.role, autoLogin: !!(user && dc.embed?.agentPass && phonePass) }, { headers: { "cache-control": "no-store" } });
}
