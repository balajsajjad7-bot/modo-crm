import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildBackup } from "@/lib/backup";
import { driveConnector, putFile, saveDriveCfg } from "@/lib/drive";

export const maxDuration = 60;

async function run() {
  const conn = await driveConnector();
  if (!conn?.cfg.refreshToken) throw new Error("Connect Google Drive or Dropbox first.");
  const date = new Date().toISOString().slice(0, 10);
  const data = await buildBackup();
  await putFile(conn, "Backups", `modo-backup-${date}.json`, JSON.stringify(data));
  await saveDriveCfg(conn.id, { lastBackupAt: new Date().toISOString() });
  return { ok: true, name: `Backups/modo-backup-${date}.json` };
}

// Daily automatic backup (Vercel cron, see vercel.json). At most once every 20 hours unless CRON_SECRET matches.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const authed = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed && (secret || !/vercel-cron/i.test(req.headers.get("user-agent") || ""))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const conn = await driveConnector();
  if (!conn?.cfg.refreshToken) return NextResponse.json({ skipped: "Drive not connected." });
  if (!authed && conn.cfg.lastBackupAt && Date.now() - new Date(conn.cfg.lastBackupAt) < 20 * 3600000) return NextResponse.json({ skipped: "Backed up recently." });
  try { return NextResponse.json(await run()); } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
// "Back up now" button
export async function POST() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try { return NextResponse.json(await run()); } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
