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
  return new NextResponse(Buffer.from(f.data), { headers: {
    "content-type": f.mime, "content-length": String(f.size), "cache-control": "private, max-age=86400",
    "x-content-type-options": "nosniff",
    "content-disposition": `${download || !/^(image|audio|video)\//.test(f.mime) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
  } });
}
