import { NextResponse } from "next/server";
import { db } from "./db";
import { COOKIE, signSession } from "./session";
import { clientIp } from "./auth";
import { getSettings } from "./settings";
import { clockIn, locationFor } from "./presence";

// Password (and code, if needed) are OK: clock agents in and set the session cookie.
export async function finishLogin(user, body = {}) {
  if (user.role === "AGENT") {
    const settings = await getSettings();
    const loc = locationFor(settings, clientIp(), body.lat != null ? { lat: Number(body.lat), lng: Number(body.lng), acc: Number(body.acc) || 0 } : null);
    await clockIn(user, { source: "login", ip: clientIp(), location: loc.location });
    await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(), status: "available", statusAt: new Date() } });
  }
  const token = await signSession({ uid: user.id, role: user.role, name: user.name, agentId: user.agentId });
  const res = NextResponse.json({ role: user.role });
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 14 * 3600 });
  return res;
}

export const needs2fa = (settings, user) => user.totpEnabled || settings.require2fa === "everyone" || (settings.require2fa === "admins" && user.role === "ADMIN");
