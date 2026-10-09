import { NextResponse } from "next/server";
import { requireManager, requireAdminOnly } from "@/lib/auth";
import { getCv } from "@/lib/cv";
import { attachCv, rebriefCv } from "@/lib/hiring";

export const maxDuration = 60;
// Download a candidate's resume (admin / supervisor with Hiring).
export async function GET(req) {
  const { error } = await requireManager("hiring");
  if (error) return error;
  const id = String(new URL(req.url).searchParams.get("id") || "");
  const b = await getCv(id);
  if (!b) return NextResponse.json({ error: "No resume." }, { status: 404 });
  return new NextResponse(Buffer.from(b.data), { headers: { "content-type": b.mime, "content-disposition": `inline; filename="${String(b.name).replace(/"/g, "")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
// Admin: upload a resume for a candidate (multipart: id + file) or re-run the AI brief ({ id, action: "brief" }).
export async function POST(req) {
  const { error } = await requireAdminOnly();
  if (error) return error;
  try {
    if ((req.headers.get("content-type") || "").includes("multipart")) {
      const f = await req.formData();
      const r = await attachCv(String(f.get("id") || ""), f.get("file"));
      return NextResponse.json({ ok: true, ...r });
    }
    const b = await req.json().catch(() => ({}));
    if (b.action === "brief") return NextResponse.json({ ok: true, brief: await rebriefCv(String(b.id || "")) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
