import { NextResponse } from "next/server";
import { mainDb } from "@/lib/db";
// Public: can Modo reach its database right now? Only says ok / which kind of problem — no details or data.
export const dynamic = "force-dynamic";
const host = () => { try { const u = new URL(String(process.env.DATABASE_URL || "").replace(/^postgres(ql)?:/, "http:")); return u.hostname.replace(/-pooler/, "").split(".")[0] + " (" + (u.pathname.slice(1) || "?") + ")"; } catch { return "not set"; } };
// Is the previous database (before the switch) reachable? Used to copy old data across.
async function oldDb() {
  const url = process.env.OLD_DATABASE_URL; if (!url) return "none";
  try {
    const { Pool, neonConfig } = await import("@neondatabase/serverless"); neonConfig.webSocketConstructor = (await import("ws")).default;
    const { cleanUrl } = await import("@/lib/neon-url");
    const p = new Pool({ connectionString: cleanUrl(url) }); const r = await p.query('select count(*)::int n from "User"'); await p.end();
    return "ok · " + r.rows[0].n + " users";
  } catch (e) { return /53000|quota/i.test(String(e.message)) ? "quota" : "error"; }
}
export async function GET() {
  const t = Date.now();
  try {
    await mainDb.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ db: "ok", host: host(), old: await oldDb(), ms: Date.now() - t }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const m = String(e?.message || "");
    const why = /53000|exceeded the quota/i.test(m) ? "quota" : /connect|timeout|ECONN|terminat/i.test(m) ? "unreachable" : "error";
    const pg = (m.match(/message: "([^"]{0,300})/) || [])[1] || m.slice(-300).replace(/postgres(ql)?:\/\/\S+/gi, "[url]");
    return NextResponse.json({ db: why, host: host(), detail: pg, code: e?.code || (m.match(/\b(5\d{4}|[0-9A-Z]{5})\b/)?.[1]) || "" }, { headers: { "cache-control": "no-store" } });
  }
}
