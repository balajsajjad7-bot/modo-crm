import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { driveConnector, saveDriveCfg, exchangeCode } from "@/lib/drive";
import { readState } from "@/lib/oauthState";

// Google / Dropbox send the admin back here after "Allow".
// The signed "state" proves it's this Modo and an admin (no cookie needed, so it works on phones and in any browser).
export async function GET(req) {
  const back = (q) => NextResponse.redirect(new URL("/admin/drive?" + new URLSearchParams(q), req.url));
  const u = new URL(req.url);
  if (u.searchParams.get("error")) return back({ error: u.searchParams.get("error_description") || u.searchParams.get("error") });
  const st = readState(u.searchParams.get("state"));
  if (!st) return back({ error: "That sign-in took longer than 30 minutes. Press Connect again." });
  const admin = st.u === "admin" ? true : await db.user.findFirst({ where: { id: st.u, role: "ADMIN" }, select: { id: true } }).catch(() => null);
  if (!admin) return back({ error: "Only an admin can connect the Drive." });
  const conn = await driveConnector();
  if (!conn) return back({ error: "Set up the Drive first." });
  const code = u.searchParams.get("code");
  if (!code) return back({ error: "Google/Dropbox didn't send a code. Press Connect again." });
  try {
    const { refreshToken, account } = await exchangeCode(conn.type, conn.cfg, code, new URL("/api/drive/oauth", req.url).toString());
    await saveDriveCfg(conn.id, { refreshToken, account, connectedAt: new Date().toISOString() });
    return back({ connected: "1" });
  } catch (e) { return back({ error: e.message }); }
}
