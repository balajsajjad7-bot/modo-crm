import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { seal } from "@/lib/connectors";
import { driveConnector, saveDriveCfg, authorizeUrl, PROVIDERS } from "@/lib/drive";

const redirectFor = (req) => new URL("/api/drive/oauth", req.url).toString();

// Save the app keys and get the "sign in to Google/Dropbox" link: { provider, clientId, clientSecret }
// With no keys, reconnects using the saved ones.
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  let conn = await driveConnector();
  const type = PROVIDERS[b.provider] ? b.provider : conn?.type;
  if (!type) return NextResponse.json({ error: "Pick Google Drive or Dropbox." }, { status: 400 });
  const clientId = String(b.clientId || "").trim(), clientSecret = String(b.clientSecret || "").trim();
  if (!conn || conn.type !== type) {
    if (!clientId || !clientSecret) return NextResponse.json({ error: "Paste the app key and secret first." }, { status: 400 });
    // Only one Drive at a time: replace any other storage connection
    await db.connector.deleteMany({ where: { type: { in: ["gdrive", "dropbox"] } } });
    await db.connector.create({ data: { type, name: PROVIDERS[type].label, config: seal({ clientId, clientSecret }), enabled: true } });
    conn = await driveConnector();
  } else if (clientId && clientSecret && !clientSecret.startsWith("••••")) {
    conn.cfg = await saveDriveCfg(conn.id, { clientId, clientSecret });
  }
  const state = crypto.randomBytes(16).toString("hex");
  cookies().set("modo_drive_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 900 });
  return NextResponse.json({ url: authorizeUrl(type, conn.cfg, redirectFor(req), state), redirectUri: redirectFor(req) });
}

// Disconnect (files stay in your Google Drive / Dropbox)
export async function DELETE() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  await db.connector.deleteMany({ where: { type: { in: ["gdrive", "dropbox"] } } });
  return NextResponse.json({ ok: true });
}
