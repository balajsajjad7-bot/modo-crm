// Automatic order tracking via AfterShip (one key covers UPS, FedEx, USPS, DHL and 1000+ carriers).
import { configFor } from "./connectors";

const BASE = "https://api.aftership.com/v4";
// AfterShip "tag" → our normalized status
const TAG = {
  Delivered: "delivered", OutForDelivery: "out_for_delivery", AvailableForPickup: "out_for_delivery",
  InTransit: "in_transit", InfoReceived: "dropped_off", Pending: "pending",
  AttemptFail: "exception", Exception: "exception", Expired: "exception", Returned: "returned",
};
export const STATUS_LABEL = {
  delivered: "Delivered", out_for_delivery: "Out for delivery", in_transit: "In transit",
  dropped_off: "Dropped off / received", picked_up: "Picked up", pending: "Label created",
  exception: "Problem — check", returned: "Returned", unknown: "Unknown",
};

export async function trackingConfig() {
  const c = await configFor("tracking");
  return c && c.apiKey ? c : (process.env.AFTERSHIP_KEY ? { apiKey: process.env.AFTERSHIP_KEY } : null);
}

const clean = (s) => String(s || "").replace(/[^A-Za-z0-9]/g, "");

// AfterShip's current API (dated versions). Used when the old v4 API refuses the key or the request.
const NEW = "https://api.aftership.com/tracking/2024-10";
async function trackNew(apiKey, num, slug) {
  const headers = { "as-api-key": apiKey, "content-type": "application/json" };
  await fetch(`${NEW}/trackings`, { method: "POST", headers, body: JSON.stringify({ tracking_number: num, ...(slug ? { slug } : {}) }), signal: AbortSignal.timeout(12000) }).catch(() => {});
  const r = await fetch(`${NEW}/trackings?tracking_numbers=${encodeURIComponent(num)}`, { headers, signal: AbortSignal.timeout(12000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.meta?.message || `AfterShip ${r.status}`);
  const t = (d?.data?.trackings || [])[0];
  if (!t) throw new Error("No tracking data yet");
  return t;
}

// Returns { status, stage, deliveredAt, raw, checkpoints } or throws.
export async function track(apiKey, trackingNo, carrier) {
  try { return await trackV4(apiKey, trackingNo, carrier); }
  catch (e) {
    const num = clean(trackingNo);
    let t;
    try { t = await trackNew(apiKey, num, carrier && carrier !== "auto" ? carrier : null); } catch (e2) { throw new Error(`${e.message}${e2.message && e2.message !== e.message ? " / " + e2.message : ""}`); }
    return fromTracking(t);
  }
}

function fromTracking(t) {
  const cps = t.checkpoints || [];
  const last = cps[cps.length - 1];
  let status = TAG[t.tag] || "unknown";
  const msg = (last?.message || "").toLowerCase();
  if (status !== "delivered" && /drop.?off|dropped|received by|origin scan|at .*(store|location)|accepted/.test(msg)) status = "dropped_off";
  if (status !== "delivered" && /picked up/.test(msg)) status = "picked_up";
  const deliveredAt = t.tag === "Delivered" ? (t.shipment_delivery_date || last?.checkpoint_time || null) : null;
  return {
    status, stage: last?.message || t.subtag_message || t.tag || "", deliveredAt, raw: t.tag || "",
    checkpoints: cps.slice(-6).map((c) => ({ at: c.checkpoint_time, msg: c.message, loc: [c.city, c.state, c.country_iso3 || c.country_region].filter(Boolean).join(", ") })),
  };
}

async function trackV4(apiKey, trackingNo, carrier) {
  const num = clean(trackingNo);
  if (!num) throw new Error("No tracking number");
  const headers = { "aftership-api-key": apiKey, "content-type": "application/json" };
  let slug = carrier && carrier !== "auto" ? carrier : null;

  if (!slug) {
    const det = await fetch(`${BASE}/couriers/detect`, { method: "POST", headers, body: JSON.stringify({ tracking: { tracking_number: num } }), signal: AbortSignal.timeout(12000) })
      .then((r) => r.json()).catch(() => null);
    slug = det?.data?.couriers?.[0]?.slug || null;
    if (!slug) throw new Error("Couldn't detect the carrier");
  }
  // Make sure the tracking is registered (ignore "already exists")
  await fetch(`${BASE}/trackings`, { method: "POST", headers, body: JSON.stringify({ tracking: { tracking_number: num, slug } }), signal: AbortSignal.timeout(12000) }).catch(() => {});
  const d = await fetch(`${BASE}/trackings/${slug}/${encodeURIComponent(num)}`, { headers, signal: AbortSignal.timeout(12000) }).then((r) => r.json());
  const t = d?.data?.tracking;
  if (!t) throw new Error(d?.meta?.message || "No tracking data yet");
  return fromTracking(t);
}
