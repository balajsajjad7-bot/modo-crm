import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth";
import { driveConnector, saveDriveCfg, exchangeCode } from "@/lib/drive";

// Google / Dropbox send the admin back here after "Allow".
export async function GET(req) {
  const back = (q) => NextResponse.redirect(new URL("/admin/drive?" + new URLSearchParams(q), req.url));
  const { error } = await requireRole("ADMIN");
  if (error) return back({ error: "Sign in to Modo as admin first, then connect again." });
  const u = new URL(req.url);
  if (u.searchParams.get("error")) return back({ error: u.searchParams.get("error_description") || u.searchParams.get("error") });
  const state = cookies().get("modo_drive_state")?.value;
  if (!state || state !== u.searchParams.get("state")) return back({ error: "The sign-in link expired. Press Connect again." });
  cookies().delete("modo_drive_state");
  const conn = await driveConnector();
  if (!conn) return back({ error: "Set up the Drive first." });
  try {
    const { refreshToken, account } = await exchangeCode(conn.type, conn.cfg, u.searchParams.get("code"), new URL("/api/drive/oauth", req.url).toString());
    await saveDriveCfg(conn.id, { refreshToken, account, connectedAt: new Date().toISOString() });
    return back({ connected: "1" });
  } catch (e) { return back({ error: e.message }); }
}
