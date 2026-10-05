import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { agentStatus, agentApi, leadInfo, dialerSettings } from "@/lib/vicidial";
import { log } from "@/lib/crm";
import { startCall, endCall, saveResult, trackDialerStatus } from "@/lib/calls";
import { dialerConfig, customCall, customStatus, DEFAULT_DISPOS, DEFAULT_PAUSE } from "@/lib/dialer";

async function viciUser(s) {
  const u = await db.user.findUnique({ where: { id: s.uid }, select: { vicidialUser: true, agentId: true, name: true } });
  return { vu: u?.vicidialUser || "", name: u?.name };
}
const d10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);
async function contactFor(s, phone) {
  const p = d10(phone); if (p.length !== 10) return null;
  const near = await db.contact.findMany({ where: { phone: { contains: p.slice(-4) } }, take: 50 });
  return near.find((c) => d10(c.phone) === p) || null;
}

// Live state of MY dialer session (polled every 2 seconds by the Modo dialer)
export async function GET() {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const dc = await dialerConfig();
  if (dc.provider === "off") return NextResponse.json({ setup: "The dialer is turned off. Admin can turn it on in Tools → Dialer setup." });
  const vs = dc.provider === "vicidial" ? await dialerSettings() : { agentUrl: dc.custom.agentUrl || "" };
  const settings = { ...vs, provider: dc.provider, dialerName: dc.provider === "custom" ? dc.name || "your dialer" : "VICIdial",
    dispositions: dc.dispositions || vs.dispositions || DEFAULT_DISPOS, pauseCodes: dc.pauseCodes || vs.pauseCodes || DEFAULT_PAUSE };
  const { vu } = await viciUser(s);
  if (!vu) return NextResponse.json({ ...settings, setup: "Admin needs to link you to your dialer login: Tools → Dialer setup → Agents." });
  if (dc.provider === "custom") {
    try {
      const c = await customStatus(dc, vu);
      let contact = null;
      if (c.phone) { const x = await contactFor(s, c.phone); if (x) { const last = await db.crmActivity.findFirst({ where: { contactId: x.id, kind: { in: ["note", "call"] } }, orderBy: { createdAt: "desc" } }); contact = { id: x.id, name: x.name, lastNote: last ? { text: last.text, at: last.createdAt } : null }; } }
      return NextResponse.json({ ...settings, vu, loggedIn: c.loggedIn, status: c.status, campaign: c.campaign, callsToday: c.callsToday, phone: c.phone, lead: c.phone ? { id: c.leadId, name: c.name, address: c.address, zip: c.zip, email: c.email } : null, contact });
    } catch (e) { return NextResponse.json({ ...settings, vu, loggedIn: false, error: e.message }); }
  }
  let row;
  try { row = (await agentStatus(vu)).row; }
  catch (e) { return NextResponse.json({ ...settings, vu, loggedIn: false, error: /isn't logged/i.test(e.message) ? null : e.message }); }
  const phone = d10(row.phone_number);
  let lead = null, contact = null;
  if (row.lead_id && row.lead_id !== "0") {
    const L = await leadInfo(row.lead_id);
    if (L) lead = { id: row.lead_id, name: [L.first_name, L.last_name].filter(Boolean).join(" "), address: [L.address1, L.address2].filter(Boolean).join(" "), city: L.city, state: L.state, zip: L.postal_code, email: L.email, comments: L.comments, vendor: L.vendor_lead_code, list: L.list_id };
    else lead = { id: row.lead_id };
  }
  if (phone) {
    const c = await contactFor(s, phone);
    if (c) {
      const last = await db.crmActivity.findFirst({ where: { contactId: c.id, kind: { in: ["note", "call"] } }, orderBy: { createdAt: "desc" } });
      contact = { id: c.id, name: c.name, lastNote: last ? { text: last.text, at: last.createdAt } : null };
    }
  }
  await trackDialerStatus(s.uid, { status: row.status, phone, name: lead?.name || contact?.name, leadId: lead?.id }).catch(() => {});
  return NextResponse.json({ ...settings, vu, loggedIn: true, status: row.status, pauseCode: row.pause_code || "", subStatus: row.real_time_sub_status || "", campaign: row.campaign_id, callsToday: Number(row.calls_today) || 0, phone, lead, contact });
}

// Actions: dial | hangup | pause | resume | dispo | park | grab | transfer | dtmf | record
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { vu } = await viciUser(s);
  if (!vu) return NextResponse.json({ error: "Your VICIdial user isn't set. Ask admin." }, { status: 400 });
  const b = await req.json();
  const dc = await dialerConfig();
  if (dc.provider === "off") return NextResponse.json({ error: "The dialer is turned off by admin." }, { status: 400 });
  if (dc.provider === "custom" && b.action !== "dispo") {
    try {
      const vars = { agent: vu, number: d10(b.number), code: b.code || "", digits: b.digits || "", on: b.on ? "1" : "0", type: b.type || "" };
      const { text } = await customCall(dc, b.action, vars);
      if (b.action === "dial") await startCall(s.uid, { phone: vars.number, name: b.name, source: "custom" }).catch(() => {});
      if (b.action === "hangup") await endCall(s.uid).catch(() => {});
      return NextResponse.json({ ok: true, message: text.slice(0, 300) });
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  }
  try {
    let out;
    switch (b.action) {
      case "dial": {
        const n = d10(b.number); if (n.length !== 10) throw new Error("Enter a 10-digit US number.");
        out = await agentApi("external_dial", vu, { value: n, phone_code: "1", search: "YES", preview: "NO", focus: "YES" });
        await startCall(s.uid, { phone: n, name: b.name }).catch(() => {}); break;
      }
      case "next": {
        // Next lead from the hopper (manual-dial campaigns). Auto campaigns just need "resume".
        try { out = await agentApi("external_dial", vu, { value: "MANUALNEXT", search: "YES", preview: "NO", focus: "YES" }); }
        catch (e) { out = await agentApi("external_pause", vu, { value: "RESUME" }); }
        break;
      }
      case "hangup": out = await agentApi("external_hangup", vu, { value: "1" }); await endCall(s.uid).catch(() => {}); break;
      case "pause": out = await agentApi("external_pause", vu, { value: "PAUSE" }); if (b.code) await agentApi("pause_code", vu, { value: b.code }).catch(() => {}); break;
      case "resume": out = await agentApi("external_pause", vu, { value: "RESUME" }); break;
      case "park": out = await agentApi("park_call", vu, { value: "PARK_CUSTOMER" }); break;
      case "grab": out = await agentApi("park_call", vu, { value: "GRAB_CUSTOMER" }); break;
      case "dtmf": out = await agentApi("send_dtmf", vu, { value: String(b.digits || "").replace(/[^0-9*#]/g, "").slice(0, 20) }); break;
      case "record": out = await agentApi("recording", vu, { value: b.on ? "START" : "STOP" }); break;
      case "transfer": {
        const types = { blind: "BLIND_TRANSFER", warm: "DIAL_WITH_CUSTOMER", leave3way: "HANGUP_XFER", hangupBoth: "HANGUP_BOTH" };
        const n = d10(b.number); if (b.type !== "leave3way" && b.type !== "hangupBoth" && n.length !== 10) throw new Error("Enter the 10-digit number to transfer to.");
        out = await agentApi("transfer_conference", vu, { value: types[b.type] || "BLIND_TRANSFER", phone_number: n || undefined }); break;
      }
      case "dispo": {
        const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!code) throw new Error("Pick a disposition.");
        const p = { value: code };
        if (b.callbackAt) { const d = new Date(b.callbackAt); p.callback_datetime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}+${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`; p.callback_type = "USERONLY"; p.callback_comments = String(b.note || "").slice(0, 200); }
        out = dc.provider === "custom" ? (await customCall(dc, "dispo", { agent: vu, code, label: b.label || code, note: b.note || "" })).text : await agentApi("external_status", vu, p);
        // Keep Modo in step: call log + note on the customer (created if new) + callback task
        const phone = d10(b.phone);
        await saveResult(s.uid, { phone, name: b.name, code, label: b.label, note: b.note }).catch(() => {});
        if (phone.length === 10) {
          let c = await contactFor(s, phone);
          if (!c) c = await db.contact.create({ data: { name: String(b.name || "").trim() || "Dialer lead " + phone.slice(-4), phone, tags: "dialer", source: "Dialer", ownerId: s.uid } });
          await log(s.uid, { contactId: c.id, kind: "call", text: `${b.label || code}${b.note ? " · " + String(b.note).slice(0, 1500) : ""}` }).catch(() => {});
          if (b.callbackAt) await db.task.create({ data: { title: `Call back ${c.name}`, type: "callback", dueAt: new Date(b.callbackAt), contactId: c.id, assigneeId: s.uid, createdById: s.uid, notes: b.note || null } }).catch(() => {});
        }
        break;
      }
      default: throw new Error("Unknown action.");
    }
    return NextResponse.json({ ok: true, message: out });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
