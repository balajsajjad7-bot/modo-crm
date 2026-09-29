import { NextResponse } from "next/server";
import { COOKIE, SESSION_MAX, readSession, signSession } from "./lib/session";

export async function middleware(req) {
  const s = await readSession(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  if ((p.startsWith("/admin") || p.startsWith("/kiosk")) && s?.role !== "ADMIN") return NextResponse.redirect(new URL("/", req.url));
  if (p.startsWith("/agent") && s?.role !== "AGENT") return NextResponse.redirect(new URL("/", req.url));
  const res = NextResponse.next();
  // Sliding session: while someone's active, keep pushing the expiry out so they never get logged out mid-use.
  if (s && s.exp && (s.exp * 1000 - Date.now()) < 25 * 24 * 3600 * 1000) {
    try {
      const token = await signSession({ uid: s.uid, role: s.role, name: s.name, agentId: s.agentId });
      res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX });
    } catch {}
  }
  return res;
}
export const config = { matcher: ["/admin/:path*", "/agent/:path*", "/kiosk"] };
