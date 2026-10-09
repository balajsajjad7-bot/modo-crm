import { NextResponse } from "next/server";
import { requireRole, requireManager } from "@/lib/auth";
import { listComplaints, fileComplaint, updateComplaint, deleteComplaint, CATEGORIES } from "@/lib/complaints";

const staff = (s) => s.role === "ADMIN" || s.role === "SUPERVISOR";

// Agents see their own complaints; admin (or a supervisor with Complaints) sees all of them.
export async function GET() {
  const { error, session } = await requireRole();
  if (error) return error;
  const all = staff(session) ? !(await requireManager("complaints")).error : false;
  return NextResponse.json({ complaints: await listComplaints(all ? {} : { uid: session.uid }), categories: CATEGORIES, admin: all });
}

export async function POST(req) {
  const { error, session } = await requireRole();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  try {
    const c = await fileComplaint(b, { uid: session.uid, name: session.name, agentId: session.agentId });
    try {
      const { alert } = await import("@/lib/bots");
      const u = c.priority === "urgent";
      await alert("complaint-" + c.id, `${u ? "🚨 URGENT complaint" : "📣 New complaint"} #${c.no} from ${session.name}\n👤 ${c.customer || "Customer"}${c.phone ? " · " + c.phone : ""}\n🏷️ ${c.category} · ${c.priority}\n💬 ${c.text.slice(0, 300)}${c.text.length > 300 ? "…" : ""}\nOpen Sales → Complaints to handle it.`, { urgent: u });
    } catch {}
    return NextResponse.json({ ok: true, complaint: c });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}

export async function PATCH(req) {
  const { error, session } = await requireRole();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const isAdmin = session.role === "ADMIN"; // supervisors are view-only (middleware blocks their writes)
  try {
    const { c, changes, note } = await updateComplaint(String(b.id || ""), b, session, isAdmin);
    if (isAdmin && (changes.length || note) && c.by?.uid) {
      try { const { tellAgent } = await import("@/lib/bots"); await tellAgent(`cmp-${c.id}-${Date.now()}`, c.by.uid, `📣 Complaint #${c.no} (${c.customer || "customer"})${changes.length ? "\n" + changes.join(" · ") : ""}${note ? "\n💬 " + note : ""}`); } catch {}
    }
    if (!isAdmin && note) { try { const { alert } = await import("@/lib/bots"); await alert(`cmpn-${c.id}-${Date.now()}`, `📣 ${session.name} added to complaint #${c.no}: ${note.slice(0, 300)}`, { wa: false }); } catch {} }
    return NextResponse.json({ ok: true, complaint: c });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}

export async function DELETE(req) {
  const { error, session } = await requireRole("ADMIN");
  if (error) return error;
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Only a full admin can delete." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  await deleteComplaint(String(id || ""));
  return NextResponse.json({ ok: true });
}
