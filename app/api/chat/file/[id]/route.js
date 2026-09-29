import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember } from "@/lib/chat";

// Only members of the conversation the file was sent in can open it.
export async function GET(req, { params }) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const msg = await db.message.findFirst({ where: { fileId: params.id } });
  if (!msg || !(await isMember(msg.conversationId, s.uid))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const f = await db.fileBlob.findUnique({ where: { id: params.id } });
  if (!f) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const full = Buffer.from(f.data);
  const total = full.length;
  const base = {
    "content-type": f.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff",
    "accept-ranges": "bytes", // audio/video on iOS/Safari won't play without Range support
    "content-disposition": `${download || !/^(image|audio|video)\//.test(f.mime) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
  };
  // Range request (media players ask for byte ranges) → 206 partial content.
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end) return new NextResponse(null, { status: 416, headers: { ...base, "content-range": `bytes */${total}` } });
    const chunk = full.subarray(start, end + 1);
    return new NextResponse(chunk, { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(chunk.length) } });
  }
  return new NextResponse(full, { status: 200, headers: { ...base, "content-length": String(total) } });
}
