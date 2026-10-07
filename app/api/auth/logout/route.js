import { NextResponse } from "next/server";
import { COOKIE, WA_COOKIE } from "@/lib/session";
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(WA_COOKIE, "", { path: "/", maxAge: 0 }); // signing out also locks WhatsApp
  return res;
}
