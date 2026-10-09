import { NextResponse } from "next/server";
import { COOKIE, SESSION_MAX, readSession, signSession } from "./lib/session";
import { sectionForPath } from "./lib/supaccess";

// Flood guard (per server instance): a signed-in person gets 900 API calls a minute, a stranger 600 per
// network address. Normal use is far below that; scripts hammering Modo get "slow down" instead of service.
const hits = new Map();
function flooded(key, limit) {
  const now = Date.now(); const h = hits.get(key);
  if (!h || now - h.at > 60000) { hits.set(key, { at: now, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > limit;
}
const ipOf = (req) => (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";

const ORG_HEADER = "x-modo-org";
const validOrg = (o) => /^[a-z0-9]{3,24}$/.test(String(o || ""));

export async function middleware(req) {
  const s = await readSession(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  // Which company's database this request uses: ONLY from the signed session — any header a visitor sends is dropped.
  const fwd = new Headers(req.headers); fwd.delete(ORG_HEADER);
  if (s?.org && validOrg(s.org)) fwd.set(ORG_HEADER, s.org);
  const pass = () => NextResponse.next({ request: { headers: fwd } });
  if (p.startsWith("/api")) {
    if (flooded(s ? "u:" + s.uid : "ip:" + ipOf(req), s ? 900 : 600)) return NextResponse.json({ error: "Too many requests — slow down." }, { status: 429, headers: { "retry-after": "60" } });
    // Cross-site request forgery: a signed-in browser may only change things from Modo's own pages.
    if (s && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.get("origin"); const site = req.headers.get("sec-fetch-site");
      let foreign = site === "cross-site";
      if (origin) { try { foreign = foreign || new URL(origin).host !== req.headers.get("host"); } catch { foreign = true; } }
      if (foreign) return NextResponse.json({ error: "Blocked: this request didn't come from Modo." }, { status: 403 });
    }
  }
  // Supervisors are view-only: they may read (GET) but never change anything. Block every write
  // to any API, so no edit/save/delete button anywhere works for them (logging out is allowed).
  if (p.startsWith("/api") && s?.role === "SUPERVISOR") {
    const writing = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (writing && p !== "/api/auth/logout") return NextResponse.json({ error: "View-only: supervisors can monitor but not change anything." }, { status: 403 });
    return pass();
  }
  if (p.startsWith("/api")) return pass();
  // Home (landing) and sign-in: someone already signed in goes straight into their Modo.
  if (p === "/" || p === "/login") return s ? NextResponse.redirect(new URL(s.role === "AGENT" ? "/agent" : "/admin", req.url)) : pass();
  if (p.startsWith("/kiosk") && s?.role !== "ADMIN") return NextResponse.redirect(new URL(s ? "/agent" : "/login", req.url));
  // A link meant for the other side (e.g. a notification) lands on the matching page for this person.
  if (p.startsWith("/admin") && s?.role !== "ADMIN" && s?.role !== "SUPERVISOR") return NextResponse.redirect(new URL(s?.role === "AGENT" ? (p.startsWith("/admin/chat") ? "/agent/chat" : "/agent") : "/login", req.url));
  if (p.startsWith("/agent") && s?.role !== "AGENT") return NextResponse.redirect(new URL(s?.role === "ADMIN" || s?.role === "SUPERVISOR" ? (p.startsWith("/agent/chat") ? "/admin/chat" : "/admin") : "/login", req.url));
  // A supervisor may only open the sections the admin granted (Overview "/admin" is always allowed).
  if (p.startsWith("/admin") && s?.role === "SUPERVISOR") {
    // Admin-only areas are never open to supervisors — redirect cleanly instead of showing an error.
    const adminOnly = ["/admin/settings", "/admin/users", "/admin/access", "/admin/org", "/admin/payroll", "/admin/whatsapp", "/admin/subscriptions", "/admin/remote"];
    if (adminOnly.some((a) => p === a || p.startsWith(a + "/"))) return NextResponse.redirect(new URL("/admin", req.url));
    const key = sectionForPath(p);
    const allowed = Array.isArray(s.sup) ? s.sup : [];
    if (key && !allowed.includes(key)) return NextResponse.redirect(new URL("/admin", req.url));
  }
  const res = pass();
  // Sliding session: while someone's active, keep pushing the expiry out so they never get logged out mid-use.
  if (s && s.exp && (s.exp * 1000 - Date.now()) < 25 * 24 * 3600 * 1000) {
    try {
      const token = await signSession({ uid: s.uid, role: s.role, name: s.name, agentId: s.agentId, ...(s.sup ? { sup: s.sup } : {}), ...(s.org ? { org: s.org } : {}) });
      res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX });
    } catch {}
  }
  return res;
}
export const config = { matcher: ["/", "/login", "/admin/:path*", "/agent/:path*", "/kiosk", "/api/:path*"] };
