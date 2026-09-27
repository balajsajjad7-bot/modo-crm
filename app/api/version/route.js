import { NextResponse } from "next/server";
import pkg from "../../../package.json";
import { CHANGELOG } from "@/lib/changelog";
import { currentUser } from "@/lib/auth";

// Current Modo version + (optional) check against an update feed URL set in .env (MODO_UPDATE_URL → JSON {version, notes, url})
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let latest = null;
  if (process.env.MODO_UPDATE_URL) { try { const r = await fetch(process.env.MODO_UPDATE_URL, { cache: "no-store", signal: AbortSignal.timeout(6000) }); if (r.ok) latest = await r.json(); } catch {} }
  const newer = latest?.version && latest.version.localeCompare(pkg.version, undefined, { numeric: true }) > 0;
  return NextResponse.json({ version: pkg.version, changelog: CHANGELOG, latest, newer: !!newer });
}
