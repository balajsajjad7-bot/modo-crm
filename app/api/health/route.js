import { NextResponse } from "next/server";
import { mainDb } from "@/lib/db";
// Public: can Modo reach its database right now? Only says ok / which kind of problem — no details or data.
export const dynamic = "force-dynamic";
export async function GET() {
  const t = Date.now();
  try {
    await mainDb.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ db: "ok", ms: Date.now() - t }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const m = String(e?.message || "");
    const why = /53000|exceeded the quota/i.test(m) ? "quota" : /connect|timeout|ECONN|terminat/i.test(m) ? "unreachable" : "error";
    const pg = (m.match(/message: "([^"]{0,300})/) || [])[1] || m.slice(-300).replace(/postgres(ql)?:\/\/\S+/gi, "[url]");
    return NextResponse.json({ db: why, detail: pg, code: e?.code || (m.match(/\b(5\d{4}|[0-9A-Z]{5})\b/)?.[1]) || "" }, { headers: { "cache-control": "no-store" } });
  }
}
