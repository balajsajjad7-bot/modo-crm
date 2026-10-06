import { NextResponse } from "next/server";
import { COOKIE, SESSION_MAX, readSession, signSession } from "./lib/session";
import { sectionForPath } from "./lib/supaccess";

export async function middleware(req) {
  const s = await readSession(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  // Supervisors are view-only: they may read (GET) but never change anything. Block every write
  // to any API, so no edit/save/delete button anywhere works for them (logging out is allowed).
  if (p.startsWith("/api") && s?.role === "SUPERVISOR") {
    const writing = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (writing && p !== "/api/auth/logout") return NextResponse.json({ error: "View-only: supervisors can monitor but not change anything." }, { status: 403 });
    return NextResponse.next();
  }
  if (p.startsWith("/api")) return NextResponse.next();
  if (p.startsWith("/kiosk") && s?.role !== "ADMIN") return NextResponse.redirect(new URL("/", req.url));
  if (p.startsWith("/admin") && s?.role !== "ADMIN" && s?.role !== "SUPERVISOR") return NextResponse.redirect(new URL("/", req.url));
  if (p.startsWith("/agent") && s?.role !== "AGENT") return NextResponse.redirect(new URL("/", req.url));
  // A supervisor may only open the sections the admin granted (Overview "/admin" is always allowed).
  if (p.startsWith("/admin") && s?.role === "SUPERVISOR") {
    // Admin-only areas are never open to supervisors — redirect cleanly instead of showing an error.
    const adminOnly = ["/admin/settings", "/admin/users", "/admin/access", "/admin/org", "/admin/payroll", "/admin/whatsapp"];
    if (adminOnly.some((a) => p === a || p.startsWith(a + "/"))) return NextResponse.redirect(new URL("/admin", req.url));
    const key = sectionForPath(p);
    const allowed = Array.isArray(s.sup) ? s.sup : [];
    if (key && !allowed.includes(key)) return NextResponse.redirect(new URL("/admin", req.url));
  }
  const res = NextResponse.next();
  // Sliding session: while someone's active, keep pushing the expiry out so they never get logged out mid-use.
  if (s && s.exp && (s.exp * 1000 - Date.now()) < 25 * 24 * 3600 * 1000) {
    try {
      const token = await signSession({ uid: s.uid, role: s.role, name: s.name, agentId: s.agentId, ...(s.sup ? { sup: s.sup } : {}) });
      res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX });
    } catch {}
  }
  return res;
}
export const config = { matcher: ["/admin/:path*", "/agent/:path*", "/kiosk", "/api/:path*"] };
