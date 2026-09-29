import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireManager } from "@/lib/auth";
import { recordingLookup } from "@/lib/vicidial";

// Admin: recordings for a day. No agent = ALL agents (tries date-only, then every linked agent). ?date=&agent=&phone=&lead=
export async function GET(req) {
  const { error } = await requireManager("recordings");
  if (error) return error;
  const q = new URL(req.url).searchParams;
  const date = q.get("date"); const agent = q.get("agent"); const phone = q.get("phone"); const lead = q.get("lead");
  try {
    let rows = [];
    if (agent || phone || lead) {
      rows = await recordingLookup({ date, agentUser: agent, phone, leadId: lead });
    } else {
      rows = await recordingLookup({ date }).catch(() => []); // some VICIdials return all for a date
      if (!rows.length) {
        // fall back: query each linked agent and merge
        const users = await db.user.findMany({ where: { role: "AGENT" }, select: { vicidialUser: true, agentId: true } });
        const logins = [...new Set(users.map((u) => (u.vicidialUser || u.agentId || "").trim()).filter(Boolean))];
        const batches = await Promise.all(logins.map((u) => recordingLookup({ date, agentUser: u }).catch(() => [])));
        rows = batches.flat();
      }
    }
    // de-dupe by recording id or url
    const seen = new Set();
    rows = rows.filter((r) => { const k = r.id || r.url; if (!k || seen.has(k)) return false; seen.add(k); return true; });
    rows.sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
    // attach any QA already marked
    const ids = rows.map((r) => r.id || r.url).filter(Boolean);
    const qa = ids.length ? await db.recordingQa.findMany({ where: { recId: { in: ids } } }) : [];
    const byId = Object.fromEntries(qa.map((x) => [x.recId, { score: x.score, outcome: x.outcome, reviewedBy: x.reviewedBy, notes: x.notes, checklist: x.checklist }]));
    return NextResponse.json({ rows: rows.map((r) => ({ ...r, qa: byId[r.id || r.url] || null })) });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
