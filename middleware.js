import { NextResponse } from "next/server";
import { COOKIE, readSession } from "./lib/session";

export async function middleware(req) {
  const s = await readSession(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  if ((p.startsWith("/admin") || p.startsWith("/kiosk")) && s?.role !== "ADMIN") return NextResponse.redirect(new URL("/", req.url));
  if (p.startsWith("/agent") && s?.role !== "AGENT") return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*", "/agent/:path*", "/kiosk"] };
