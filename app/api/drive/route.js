import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { driveConnector, listFolder, makeFolder, removeItem, renameItem, uploadTarget, PROVIDERS } from "@/lib/drive";

export const maxDuration = 30;
const fail = (e) => NextResponse.json({ error: e.message || "Drive request failed." }, { status: 502 });

// List a folder: ?folder=<path or id>
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const conn = await driveConnector();
  if (!conn) return NextResponse.json({ setup: true });
  const info = { provider: conn.type, label: PROVIDERS[conn.type].label, account: conn.cfg.account || "", connected: !!conn.cfg.refreshToken, lastBackupAt: conn.cfg.lastBackupAt || null, clientId: conn.cfg.clientId || "" };
  if (!info.connected) return NextResponse.json({ ...info, items: [] });
  try { return NextResponse.json({ ...info, items: await listFolder(conn, new URL(req.url).searchParams.get("folder") || "") }); }
  catch (e) { return NextResponse.json({ ...info, items: [], error: e.message }); }
}

// { action: "mkdir", parent, name } | { action: "upload", parent, name, size, type } → direct upload URL
// { action: "delete", id } | { action: "rename", id, name }
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const conn = await driveConnector();
  if (!conn?.cfg.refreshToken) return NextResponse.json({ error: "Connect Google Drive or Dropbox first." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 200);
  try {
    if (b.action === "mkdir") { if (!name) throw new Error("Type a folder name."); return NextResponse.json(await makeFolder(conn, b.parent || "", name)); }
    if (b.action === "upload") { if (!name) throw new Error("No file name."); return NextResponse.json(await uploadTarget(conn, b.parent || "", name, Number(b.size) || 0, String(b.type || ""), new URL(req.url).origin)); }
    if (b.action === "delete") { await removeItem(conn, String(b.id)); return NextResponse.json({ ok: true }); }
    if (b.action === "rename") { if (!name) throw new Error("Type a name."); return NextResponse.json(await renameItem(conn, String(b.id), name)); }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { return fail(e); }
}
