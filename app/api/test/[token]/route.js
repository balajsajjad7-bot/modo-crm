import { NextResponse } from "next/server";
import { guard } from "@/lib/testGuard";
import { byToken, getTest, saveTest, markStarted, finishTest, openSlots, scheduleInterview } from "@/lib/hiring";
import { publicItem, SECTIONS, TRACKS } from "@/lib/englishTest";

export const maxDuration = 60;
const LIMIT_MIN = 60; // the whole test must be done within an hour of starting

const expired = (c, t) => !t.startedAt && c.expiresAt && new Date(c.expiresAt) < new Date();
const overTime = (t) => t.startedAt && !t.finishedAt && Date.now() - new Date(t.startedAt) > LIMIT_MIN * 60000;

async function state(c, v, t) {
  const done = !!t.finishedAt;
  const iv = (c.interviews || []).filter((x) => x.status === "scheduled" && new Date(x.at) > Date.now() - 3600000).sort((a, b) => new Date(a.at) - new Date(b.at))[0];
  const passed = !!c.result?.pass;
  return {
    hasCv: !!c.cv, name: c.name.split(" ")[0], company: v.settings.company || "Modo", track: TRACKS[c.track], status: c.status,
    expired: expired(c, t), started: !!t.startedAt, finished: done, startedAt: t.startedAt, limitMin: LIMIT_MIN,
    sections: SECTIONS, items: done ? [] : t.items.map(publicItem), answered: Object.keys(t.answers),
    interview: iv ? { at: iv.at, mins: iv.mins, joinUrl: iv.zoom?.joinUrl || v.settings.zoomLink || "", passcode: iv.zoom?.passcode || "", interviewer: iv.interviewer || "" } : null,
    slots: done && passed && !iv ? openSlots(v).slice(0, 30).map((s) => ({ id: s.id, at: s.at })) : [],
  };
}

export async function GET(req, { params }) {
  const r = await guard(params.token); if (r.error) return r.error;
  const t = await getTest(r.c);
  if (overTime(t)) await finishTest(r.c, t);
  return NextResponse.json(await state(r.c, r.v, t));
}

// { action: "start" | "answer" | "event" | "finish" | "book", ... }
export async function POST(req, { params }) {
  const r = await guard(params.token); if (r.error) return r.error;
  const { c } = r; const b = await req.json().catch(() => ({}));
  const t = await getTest(c);
  if (b.action === "book") {
    if (!t.finishedAt || !c.result?.pass) return NextResponse.json({ error: "Booking opens after a passing test." }, { status: 400 });
    if ((c.interviews || []).some((x) => x.status === "scheduled")) return NextResponse.json({ error: "You already have an interview booked." }, { status: 400 });
    const slot = openSlots(r.v).find((s) => s.id === b.slotId); if (!slot) return NextResponse.json({ error: "That time was just taken. Pick another." }, { status: 409 });
    try {
      await scheduleInterview(c.id, { at: slot.at }, slot.id);
      try { const { alert } = await import("@/lib/bots"); await alert("hire-book-" + c.id + slot.id, `📅 ${c.name} booked an interview for ${new Date(slot.at).toLocaleString("en-US", { timeZone: "Asia/Karachi", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} PKT (Zoom link ready in Hiring).`, { wa: false }); } catch {}
      const again = await byToken(params.token);
      return NextResponse.json(await state(again.c, again.v, t));
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  }
  if (t.finishedAt) return NextResponse.json({ error: "You've already finished this test." }, { status: 400 });
  if (expired(c, t)) return NextResponse.json({ error: "This test link has expired. Ask the recruiter for a new one." }, { status: 410 });
  if (overTime(t)) { await finishTest(c, t); return NextResponse.json({ error: "Time is up — your answers were submitted." }, { status: 410 }); }
  if (b.action === "start") {
    if (!t.startedAt) { t.startedAt = new Date().toISOString(); await saveTest(c, t); await markStarted(c); }
    return NextResponse.json({ ok: true, startedAt: t.startedAt });
  }
  if (!t.startedAt) return NextResponse.json({ error: "Press Start first." }, { status: 400 });
  if (b.action === "event") {
    const k = b.kind === "paste" ? "paste" : "tab"; t.events = t.events || { tab: 0, paste: 0 }; t.events[k] = (t.events[k] || 0) + 1;
    await saveTest(c, t); return NextResponse.json({ ok: true });
  }
  if (b.action === "answer") {
    const it = t.items.find((i) => i.id === b.item);
    if (!it || it.type.startsWith("speak")) return NextResponse.json({ error: "Unknown question." }, { status: 400 });
    if (t.answers[it.id]) return NextResponse.json({ ok: true }); // answers can't be changed
    t.answers[it.id] = it.type.startsWith("choice") ? { choice: parseInt(b.choice, 10) } : { text: String(b.text || "").slice(0, 6000), secs: Number(b.secs) || null };
    await saveTest(c, t); return NextResponse.json({ ok: true });
  }
  if (b.action === "finish") { await finishTest(c, t); const fresh = await byToken(params.token); return NextResponse.json(await state(fresh.c, fresh.v, t)); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
