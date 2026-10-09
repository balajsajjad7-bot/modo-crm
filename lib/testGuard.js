import { NextResponse } from "next/server";
import { clientIp } from "./auth";
import { isBlocked, failed, waitText } from "./throttle";
import { byToken } from "./hiring";

// The candidate's own test link (no Modo login). Wrong links are throttled per connection.
export async function guard(token) {
  const key = "testlink:" + (clientIp() || "?");
  const bl = await isBlocked(key);
  if (bl.blocked) return { error: NextResponse.json({ error: `Too many wrong links. Try again in ${waitText(bl.wait)}.` }, { status: 429 }) };
  const r = await byToken(token);
  if (!r) { await failed(key, { max: 10, windowMs: 3600000, baseLockMs: 3600000 }); return { error: NextResponse.json({ error: "This test link isn't valid. Ask the recruiter for a new one." }, { status: 404 }) }; }
  return r;
}
