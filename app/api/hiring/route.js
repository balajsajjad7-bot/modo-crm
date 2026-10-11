import { NextResponse } from "next/server";
import { requireManager, requireAdminOnly } from "@/lib/auth";
import { loadHiring, publicSettings, addCandidate, updateCandidate, deleteCandidate, scheduleInterview, updateInterview, addSlots, removeSlot, saveSettings, inviteText, calendarLink, withLink, STAGES } from "@/lib/hiring";
import { TRACKS } from "@/lib/englishTest";

// Team → Hiring & interviews.
export async function GET() {
  const { error } = await requireManager("hiring");
  if (error) return error;
  const v = await loadHiring();
  const cands = v.candidates.map((c) => ({ ...c, interviews: (c.interviews || []).map((iv) => ({ ...withLink(iv, v.settings), invite: inviteText(c, iv, v.settings), cal: calendarLink(c, iv, v.settings) })) }));
  return NextResponse.json({ candidates: cands, slots: v.slots, settings: publicSettings(v.settings), tracks: TRACKS, stages: STAGES });
}

export async function POST(req) {
  const { error } = await requireAdminOnly();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "add": return NextResponse.json({ ok: true, candidate: await addCandidate(b.candidate || {}) });
      case "update": return NextResponse.json({ ok: true, candidate: await updateCandidate(String(b.id), b.patch || {}) });
      case "delete": await deleteCandidate(String(b.id)); return NextResponse.json({ ok: true });
      case "hire": { const { hireCandidate } = await import("@/lib/hiring"); const { session } = await requireAdminOnly(); return NextResponse.json({ ok: true, ...(await hireCandidate(String(b.id), b.hire || {}, session?.name || "Admin")) }); }
      case "newPassword": { const { rehirePassword } = await import("@/lib/hiring"); return NextResponse.json({ ok: true, ...(await rehirePassword(String(b.id))) }); }
      case "letter": { const { loadHiring: lh, letterData } = await import("@/lib/hiring"); const v = await lh(); const c = v.candidates.find((x) => x.id === String(b.id)); if (!c) throw new Error("Candidate not found."); return NextResponse.json({ ok: true, letter: letterData(c, v.settings) }); }
      case "schedule": { const r = await scheduleInterview(String(b.id), b.interview || {}); return NextResponse.json({ ok: true, warn: r.warn }); }
      case "interview": await updateInterview(String(b.id), String(b.ivId), b.patch || {}); return NextResponse.json({ ok: true });
      case "slots": return NextResponse.json({ ok: true, slots: await addSlots(b.slots) });
      case "slotDel": await removeSlot(String(b.slotId)); return NextResponse.json({ ok: true });
      case "settings": return NextResponse.json({ ok: true, settings: await saveSettings(b.settings || {}) });
      case "zoomTest": {
        const { zoomCreds } = await import("@/lib/hiring"); const { zoomToken } = await import("@/lib/zoom");
        const creds = zoomCreds((await loadHiring()).settings); if (!creds) return NextResponse.json({ error: "Save the Zoom Account ID, Client ID and Client secret first." }, { status: 400 });
        await zoomToken(creds); return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
