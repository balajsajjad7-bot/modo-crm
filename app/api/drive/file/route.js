import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { driveConnector, downloadResponse } from "@/lib/drive";
import { signParams, checkSigned } from "@/lib/signedUrl";

export const maxDuration = 60;
const page = (msg, status = 400) => new NextResponse(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:24px;background:#0b0b12;color:#eee"><h3>Couldn't download</h3><p>${String(msg).replace(/</g, "&lt;")}</p><p><a style="color:#a78bfa" href="/admin/drive">Back to Drive</a></p>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });

// Admin asks for a download link (works in any window for 5 minutes): { id } → { url }
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Which file?" }, { status: 400 });
  const conn = await driveConnector();
  if (!conn?.cfg.refreshToken) return NextResponse.json({ error: "Drive isn't connected." }, { status: 400 });
  try {
    if (conn.type === "dropbox") { const d = await downloadResponse(conn, String(id)); if (d.redirect) return NextResponse.json({ url: d.redirect }); }
    return NextResponse.json({ url: signParams("/api/drive/file", { id: String(id) }) });
  } catch (e) { return NextResponse.json({ error: e.message, reconnect: !!e.reconnect }, { status: 502 }); }
}

// Download: a signed link, or the signed-in admin
export async function GET(req) {
  if (!checkSigned(req, "/api/drive/file")) {
    const { error } = await requireRole("ADMIN");
    if (error) return page("This download link has expired or you're not signed in to Modo as admin here. Go back to Drive and tap download again.", 403);
  }
  const conn = await driveConnector();
  if (!conn?.cfg.refreshToken) return page("Drive isn't connected.");
  try {
    const d = await downloadResponse(conn, new URL(req.url).searchParams.get("id") || "");
    if (d.redirect) return NextResponse.redirect(d.redirect);
    return new NextResponse(d.stream, { headers: { "content-type": d.mime || "application/octet-stream", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.name || "file")}`, ...(d.size ? { "content-length": String(d.size) } : {}), "cache-control": "no-store" } });
  } catch (e) { return page(e.message, 502); }
}
