import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, readSession } from "./session";
import { lockState } from "./lock";

// Signed-in user from the session cookie. During an emergency stop only admins are let through.
export async function currentUser() {
  const s = await readSession(cookies().get(COOKIE)?.value);
  if (s && s.role !== "ADMIN" && (await lockState()).on) return null;
  return s;
}
export async function requireRole(role) {
  const s = await currentUser();
  if (!s) return { error: NextResponse.json({ error: "Sign in first.", locked: (await lockState()).on || undefined }, { status: 401 }) };
  if (role && s.role !== role) return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  return { session: s };
}
export function clientIp() {
  const h = headers();
  return (h.get("x-nf-client-connection-ip") || h.get("x-forwarded-for") || "").split(",")[0].trim() || null;
}
