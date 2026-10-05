import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { driveConnector, downloadResponse } from "@/lib/drive";

export const maxDuration = 60;
// Download a file: ?id=<path or id>
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const conn = await driveConnector();
  if (!conn?.cfg.refreshToken) return NextResponse.json({ error: "Drive isn't connected." }, { status: 400 });
  try {
    const d = await downloadResponse(conn, new URL(req.url).searchParams.get("id") || "");
    if (d.redirect) return NextResponse.redirect(d.redirect);
    return new NextResponse(d.stream, { headers: { "content-type": d.mime || "application/octet-stream", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.name || "file")}`, ...(d.size ? { "content-length": String(d.size) } : {}), "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
