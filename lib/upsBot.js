// Modo bot: tracks each sale's UPS package by itself and writes the status onto the sale card.
// Sources, best first: UPS's own API (free UPS developer app) → Shippo (the return-label account) → AfterShip.
import { db } from "./db";
import { feed, tag } from "./salesFeed";
import { configFor } from "./connectors";
import { track as afterShip, trackingConfig } from "./tracking";
import { sendPush } from "./push";

export const STEPS = [["label", "Label made"], ["dropped_off", "Dropped off"], ["in_transit", "On the way"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"]];
export const UPS_LABEL = { label: "Label made", dropped_off: "Dropped off at UPS", in_transit: "On the way", out_for_delivery: "Out for delivery", delivered: "Delivered", exception: "Problem — check", returned: "Returned to sender", unknown: "Waiting for UPS" };
const DONE = ["delivered", "returned"];
const DROP = /drop.?off|dropped|received by ups|we have your package|origin scan|access point|ups store|customer center|accepted|pick.?up scan|picked up/i;

export const upsUrl = (n) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(String(n || "").replace(/\s/g, ""))}`;
export const trackUrl = (n, service) => /^usps/i.test(service || "") ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`
  : /^fedex/i.test(service || "") ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` : upsUrl(n);
const clean = (n) => String(n || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
export const isUps = (n) => /^1Z[0-9A-Z]{16}$/.test(clean(n));

// Find a tracking number written anywhere in a sale (notes, specs, pasted details) — agents often paste the
// 1Z… number into the notes instead of the Tracking number box. UPS (1Z…), USPS (92/93/94/95 + 20–22 digits).
export function findTracking(...texts) {
  const t = texts.filter(Boolean).join(" \n ");
  const ups = t.match(/\b1Z[\s-]?(?:[0-9A-Z][\s-]?){15}[0-9A-Z]\b/i);
  if (ups) { const n = clean(ups[0]); if (isUps(n)) return { num: n, carrier: "ups" }; }
  const usps = t.match(/\b9[2-5](?:[\s-]?\d){18,20}\b/);
  if (usps) return { num: clean(usps[0]), carrier: "usps" };
  return null;
}
const carrierOf = (num, service) => /^usps/i.test(service || "") ? "usps" : /^fedex/i.test(service || "") ? "fedex" : /^dhl/i.test(service || "") ? "dhl" : isUps(num) ? "ups" : "ups";

function norm(text, type) {
  const t = String(text || "").toLowerCase();
  if (type === "D" || /\bdelivered\b/.test(t) && !/not delivered|will be delivered|scheduled/.test(t)) return "delivered";
  if (/returned to (the )?sender|return to sender|returning to sender/.test(t) || type === "RS") return "returned";
  if (/out for delivery|on vehicle for delivery/.test(t)) return "out_for_delivery";
  if (type === "X" || /exception|delay|damaged|unable|incorrect address|held|failure|failed/.test(t)) return "exception";
  if (type === "M" || /label created|shipper created a label|billing information|pre.?transit|order processed|information received/.test(t)) return "label";
  if (DROP.test(t) || type === "P") return "dropped_off";
  if (type === "I" || /transit|departed|arrived|facility|processing|loaded|on the way|destination scan|import scan/.test(t)) return "in_transit";
  return "unknown";
}

// The package's real stage = the furthest step any scan reached (UPS's newest scan can be a plain
// "Origin Scan"/"Drop-Off" line even after it has departed a facility). Problems/returns only count if newest.
const RANK = { label: 0, dropped_off: 1, in_transit: 2, out_for_delivery: 3, delivered: 4 };
function progress(status, events) {
  if (status === "delivered" || status === "returned" || status === "exception") return status;
  let best = status in RANK ? status : null;
  for (const e of events || []) {
    const s = norm(e.msg, e.type);
    if (s === "delivered" || !(s in RANK)) continue;
    if (best == null || RANK[s] > RANK[best]) best = s;
  }
  return best || status;
}

// ── UPS API (developer.ups.com: free app with the Tracking API → Client ID + Client Secret) ──
let tok = null;
async function upsToken(c) {
  if (tok && tok.key === c.clientId && tok.exp > Date.now() + 60000) return tok.v;
  const r = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", { method: "POST", signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64") }, body: "grant_type=client_credentials" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("UPS sign-in failed: " + (d.response?.errors?.[0]?.message || r.status));
  tok = { key: c.clientId, v: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 }; return tok.v;
}
const upsDate = (d, t) => (d ? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${(t || "120000").replace(/(\d\d)(\d\d)(\d\d)/, "$1:$2:$3")}`).toISOString() : null);
async function viaUps(c, num) {
  const r = await fetch(`https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(num)}?locale=en_US&returnSignature=false`, { signal: AbortSignal.timeout(12000),
    headers: { authorization: "Bearer " + (await upsToken(c)), transId: Math.random().toString(36).slice(2), transactionSrc: "modo" } });
  const d = await r.json().catch(() => ({}));
  const pkg = d?.trackResponse?.shipment?.[0]?.package?.[0];
  if (!pkg) throw new Error(d?.response?.errors?.[0]?.message || d?.trackResponse?.shipment?.[0]?.warnings?.[0]?.message || "UPS has no scans yet");
  const acts = pkg.activity || [];
  const events = acts.map((a) => ({ at: upsDate(a.date, a.time), msg: a.status?.description || "", loc: [a.location?.address?.city, a.location?.address?.stateProvince].filter(Boolean).join(", "), type: a.status?.type }));
  const last = events[0] || {};
  const status = progress(norm(pkg.currentStatus?.description || last.msg, pkg.currentStatus?.type || last.type), events);
  const eta = (pkg.deliveryDate || []).find((x) => x.type !== "DEL")?.date;
  const del = (pkg.deliveryDate || []).find((x) => x.type === "DEL")?.date;
  return { status, stage: pkg.currentStatus?.description || last.msg || "", events, eta: eta ? upsDate(eta, "170000") : null, deliveredAt: status === "delivered" ? (del ? upsDate(del, pkg.deliveryTime?.endTime) : last.at) : null, source: "UPS" };
}

// ── Shippo tracking (works with the same token as return labels) ──
async function viaShippo(key, num, carrier) {
  const r = await fetch(`https://api.goshippo.com/tracks/${carrier}/${encodeURIComponent(num)}`, { headers: { authorization: `ShippoToken ${key}` }, signal: AbortSignal.timeout(12000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || d.message || "Shippo tracking " + r.status);
  const ts = d.tracking_status;
  if (!ts) throw new Error("UPS has no scans yet");
  const hist = (d.tracking_history || []).slice().reverse();
  const events = hist.map((h) => ({ at: h.status_date, msg: h.status_details || h.status, loc: [h.location?.city, h.location?.state].filter(Boolean).join(", ") }));
  const map = { DELIVERED: "delivered", RETURNED: "returned", FAILURE: "exception", PRE_TRANSIT: "label" };
  let status = map[ts.status] || norm(ts.status_details, "");
  if (ts.status === "TRANSIT") status = /out_for_delivery/.test(ts.substatus?.code || "") ? "out_for_delivery" : norm(ts.status_details) === "dropped_off" ? "dropped_off" : "in_transit";
  if (status === "unknown" && ts.status === "UNKNOWN") status = "label";
  status = progress(status, events);
  return { status, stage: ts.status_details || ts.status, events, eta: d.eta || null, deliveredAt: status === "delivered" ? ts.status_date : null, source: "Shippo" };
}

export async function sources() {
  const ups = await configFor("ups"); const shippo = await configFor("shippo"); const as = await trackingConfig();
  // A shippo_test_ token can't track real packages: use the live "tracking" token if given, never the test one.
  const live = [shippo?.trackToken, shippo?.apiKey].find((k) => k && !/^shippo_test_/i.test(String(k).trim()));
  return { ups: ups?.clientId && ups?.clientSecret ? ups : null, shippo: live || null, aftership: as?.apiKey || null, shippoTest: !live && /^shippo_test_/i.test(String(shippo?.apiKey || "")) };
}
export async function trackPackage(num, service, src) {
  src = src || (await sources());
  const n = clean(num); const carrier = carrierOf(n, service);
  const errs = [];
  if (src.ups && carrier === "ups") try { return await viaUps(src.ups, n); } catch (e) { errs.push("UPS: " + e.message); }
  if (src.shippo && carrier !== "dhl") try { return await viaShippo(src.shippo, n, carrier); } catch (e) { errs.push("Shippo: " + e.message); }
  if (src.aftership) try { const r = await afterShip(src.aftership, n, carrier === "ups" ? "ups" : carrier === "usps" ? "usps" : carrier === "fedex" ? "fedex" : "dhl"); const ev = (r.checkpoints || []).slice().reverse(); return { status: progress(r.status === "pending" ? "label" : r.status === "picked_up" ? "dropped_off" : r.status, ev), stage: r.stage, events: ev, eta: null, deliveredAt: r.deliveredAt, source: "AfterShip" }; } catch (e) { errs.push("AfterShip: " + e.message); }
  if (!src.ups && !src.shippo && !src.aftership) throw new Error(src.shippoTest ? "SHIPPO_TEST" : "NO_SOURCE");
  // Show every source's reason so the card says exactly what's wrong (bad key, no scans yet, …).
  const nothingYet = errs.every((e) => /no scans|not found|no tracking|no data|invalid inquiry|no information/i.test(e));
  throw new Error(nothingYet ? "UPS has no scans for this number yet — it shows up after the first scan." : errs.join(" · "));
}

// The package for a sale: the UPS return label first, else the shipment tracking number.
export const pkgOf = (s) => (s.returnTracking ? { num: s.returnTracking, service: s.returnService } : s.trackingNo && (isUps(s.trackingNo) || !/^(verizon|att|tmobile)$/i.test(s.carrier || "")) ? { num: s.trackingNo, service: isUps(s.trackingNo) ? "ups" : s.carrier } : null);

const first = (n) => String(n || "").split(" ")[0];

// Fill the Tracking number box for sales whose number is only written in notes/specs/pasted details.
export async function adoptTrackingFromText(id) {
  const where = id ? { id, trackingNo: null, returnTracking: null } : { trackingNo: null, returnTracking: null, status: { not: "REJECTED" },
    OR: ["notes", "specs", "raw", "gift"].map((f) => ({ [f]: { contains: "1Z", mode: "insensitive" } })) };
  const rows = await db.sale.findMany({ where, take: id ? 1 : 60, orderBy: { createdAt: "desc" }, select: { id: true, notes: true, specs: true, raw: true, gift: true, orderNumber: true, customer: true, receipt: true } }).catch(() => []);
  let n = 0;
  for (const r of rows) {
    const f = findTracking(r.notes, r.specs, r.gift, r.raw);
    if (!f) continue;
    await db.sale.update({ where: { id: r.id }, data: { trackingNo: f.num, carrier: f.carrier, upsStatus: null, upsAt: null, upsError: null } }).catch(() => {});
    await feed(`🚚 ${tag(r)} tracking number found in the sale details: ${f.num} — Modo bot is tracking it`).catch(() => {});
    n++;
  }
  return n;
}
// Run the bot: { id } for one sale, otherwise the stalest open packages (each at most every `staleMin` minutes).
export async function runBot({ id, limit = 12, staleMin = 20 } = {}) {
  const src = await sources();
  if (!src.ups && !src.shippo && !src.aftership) return { ok: false, needsSetup: true, shippoTest: !!src.shippoTest, checked: 0 };
  const since = new Date(Date.now() - staleMin * 60000);
  if (!id) await adoptTrackingFromText(); // sales with a 1Z… number only in their notes get it filled in
  const where = id ? { id } : { status: { not: "REJECTED" }, OR: [{ returnTracking: { not: null } }, { trackingNo: { not: null } }],
    AND: [{ OR: [{ upsStatus: null }, { upsStatus: { notIn: DONE } }] }, { OR: [{ upsAt: null }, { upsAt: { lt: since } }] }] };
  const sales = await db.sale.findMany({ where, orderBy: [{ upsAt: { sort: "asc", nulls: "first" } }], take: id ? 1 : limit,
    select: { id: true, userId: true, customer: true, orderNumber: true, device: true, returnTracking: true, returnService: true, trackingNo: true, carrier: true, upsStatus: true, dropStore: true } });
  let changed = 0; const out = [];
  await Promise.all(sales.map(async (s) => {
    const p = pkgOf(s); if (!p) return;
    if (!id) { const c = await db.sale.updateMany({ where: { id: s.id, OR: [{ upsAt: null }, { upsAt: { lt: since } }] }, data: { upsAt: new Date() } }).catch(() => ({ count: 1 })); if (!c.count) return; }
    try {
      const r = await trackPackage(p.num, p.service, src);
      const data = { upsStatus: r.status, upsStage: String(r.stage || "").slice(0, 300), upsEta: r.eta ? new Date(r.eta) : null, upsAt: new Date(), upsSrc: r.source,
        upsEvents: JSON.stringify((r.events || []).slice(0, 8)), upsError: null };
      if (r.deliveredAt) data.deliveredAt = new Date(r.deliveredAt);
      // Drop-off scan → remember which UPS location took the package
      if (!s.dropStore) {
        const ev = (r.events || []).slice().reverse().find((e) => DROP.test(e.msg || ""));
        if (ev) data.dropStore = JSON.stringify({ name: (ev.msg.match(/(The UPS Store[^,.;]*|UPS Access Point[^,.;]*|UPS Customer Center[^,.;]*)/i)?.[1]) || "UPS drop-off", addr: ev.loc || "", at: ev.at || new Date().toISOString(), how: "tracking", msg: ev.msg.slice(0, 160) });
      }
      await db.sale.update({ where: { id: s.id }, data });
      out.push({ id: s.id, status: r.status });
      if (r.status !== s.upsStatus) await feed(`${{ delivered: "✅", out_for_delivery: "🚚", in_transit: "📦", dropped_off: "🏪", exception: "⚠️", returned: "↩️", label: "🏷" }[r.status] || "📦"} ${tag(s)} UPS: ${UPS_LABEL[r.status] || r.status}${r.stage && r.stage !== (UPS_LABEL[r.status] || r.status) ? " — " + r.stage : ""}`);
      // Alert on every change; on the very first check only for news worth a ping (delivered, out for delivery, a problem).
      if (r.status !== s.upsStatus && (s.upsStatus || ["delivered", "out_for_delivery", "exception", "returned"].includes(r.status))) {
        changed++;
        const admins = (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })).map((u) => u.id);
        const what = UPS_LABEL[r.status] || r.status;
        const icon = { delivered: "✅", out_for_delivery: "🚚", in_transit: "📦", dropped_off: "🏪", exception: "⚠️", returned: "↩️" }[r.status] || "📦";
        sendPush([...admins, s.userId], { title: `${icon} ${what} · #${s.orderNumber || "sale"}`, body: `${first(s.customer) || "Customer"}'s ${s.device || "package"}: ${r.stage || what}`, url: "/admin/sales", tag: "ups-" + s.id, urgent: r.status === "exception" }).catch(() => {});
      }
    } catch (e) {
      await db.sale.update({ where: { id: s.id }, data: { upsAt: new Date(), upsError: String(e.message).slice(0, 200) } }).catch(() => {});
      out.push({ id: s.id, error: e.message });
    }
  }));
  return { ok: true, checked: sales.length, changed, results: out };
}
