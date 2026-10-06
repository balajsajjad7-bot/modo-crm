import { configFor } from "./connectors";
import { feed, tag, money } from "./salesFeed";
import { askAI } from "./ai";
import { db } from "./db";
import { sendMail } from "./mailer";
import { getSettings } from "./settings";

const FIELDS = { id: true, returnLabelUrl: true, returnTracking: true, returnCost: true, returnService: true, returnLabelAt: true, returnError: true };

// Return labels through Shippo (discounted UPS/USPS rates, pay per label, free account).
// The label ships FROM the customer's address TO your return / warehouse address (set in
// Admin → Connectors → Return labels). Pirate Ship has no API, so it can't be automated; the
// sale card has a Pirate Ship button that copies both addresses for a manual label instead.
const API = "https://api.goshippo.com";
const yes = (v, def = false) => (v == null || v === "" ? def : /^(y|yes|true|on|1)$/i.test(String(v).trim()));

export async function returnConfig() {
  const c = await configFor("shippo");
  if (!c || !c.apiKey) return null;
  const [l, w, h] = String(c.boxSize || "10x7x4").split(/[x×*, ]+/).map(Number);
  return {
    key: c.apiKey,
    to: { name: c.toName || c.toCompany || "Returns", company: c.toCompany || "", street1: c.toStreet || "", street2: c.toStreet2 || "", city: c.toCity || "",
      state: String(c.toState || "").toUpperCase(), zip: c.toZip || "", country: "US", phone: c.toPhone || "", email: c.toEmail || "" },
    parcel: { length: String(l || 10), width: String(w || 7), height: String(h || 4), distance_unit: "in", weight: String(Number(c.weightLb) || 1), mass_unit: "lb" },
    carrier: String(c.carrierPref || "UPS").trim(),
    maxPrice: Number(c.maxPrice) || 25,
    auto: yes(c.auto, false),
    emailCustomer: yes(c.emailCustomer, true),
    test: String(c.apiKey).startsWith("shippo_test_"),
  };
}

// "123 Main St Apt 4, Dallas, TX 75201" → parts. Falls back to the AI for messy addresses.
export async function splitAddress(address, zip) {
  const raw = String(address || "").replace(/\s+/g, " ").trim();
  if (!raw) throw new Error("This sale has no customer address.");
  const m = raw.match(/^(.+?),\s*(?:(.+?),\s*)?([^,]+?),?\s+([A-Za-z]{2})\.?,?\s*(\d{5}(?:-\d{4})?)?\s*(?:,?\s*(?:US|USA|United States))?$/i);
  if (m && (m[5] || zip)) {
    const unit = m[2] && /^(apt|unit|suite|ste|#|fl|floor|bldg|room)/i.test(m[2]) ? m[2] : "";
    return { street1: unit || !m[2] ? m[1] : `${m[1]} ${m[2]}`, street2: unit, city: m[3], state: m[4].toUpperCase(), zip: m[5] || String(zip || "").trim() };
  }
  const d = await askAI("You split US postal addresses into parts. Reply with JSON only.",
    `Split this US address: "${raw}"${zip ? ` (ZIP ${zip})` : ""}.\nJSON: {"street1":"","street2":"","city":"","state":"2-letter","zip":""}`, { json: true, knowledge: false, maxTokens: 200 });
  if (!d?.street1 || !d?.city || !d?.state) throw new Error("Couldn't read the customer's address. Fix it on the sale (street, city, state ZIP).");
  return { street1: d.street1, street2: d.street2 || "", city: d.city, state: String(d.state).toUpperCase().slice(0, 2), zip: d.zip || String(zip || "") };
}

async function shippo(cfg, path, body) {
  const r = await fetch(API + path, { method: "POST", headers: { authorization: `ShippoToken ${cfg.key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.detail || (typeof d === "object" ? Object.entries(d).map(([k, v]) => `${k}: ${[].concat(v).map((x) => (typeof x === "object" ? JSON.stringify(x) : x)).join(", ")}`).join("; ") : "");
    throw new Error(r.status === 401 ? "Shippo didn't accept the API key. Check it in Connectors → Return labels." : "Shippo: " + (msg || `request failed (${r.status})`).slice(0, 300));
  }
  return d;
}

// Get prices for a label from the customer's address to the warehouse (nothing is charged yet).
export async function quoteRates(sale, cfg) {
  cfg = cfg || (await returnConfig());
  if (!cfg) throw new Error("Return labels aren't set up yet. Add Shippo in Admin → Connectors → Return labels.");
  if (!cfg.to.street1 || !cfg.to.city || !cfg.to.state || !cfg.to.zip) throw new Error("Add your return (warehouse) address in Connectors → Return labels.");
  const from = await splitAddress(sale.address, sale.zip);
  const shipment = await shippo(cfg, "/shipments/", {
    address_from: { name: sale.customer || "Customer", ...from, country: "US", phone: sale.phone || cfg.to.phone, email: sale.email || "" },
    address_to: cfg.to,
    parcels: [cfg.parcel],
    async: false,
  });
  const want = cfg.carrier.toLowerCase();
  let rates = (shipment.rates || []).map((r) => ({ id: r.object_id, provider: r.provider, service: r.servicelevel?.name || "", price: Number(r.amount), days: r.estimated_days ?? null, overLimit: Number(r.amount) > cfg.maxPrice }));
  if (want && want !== "cheapest" && want !== "any") rates = rates.filter((r) => String(r.provider).toLowerCase().includes(want));
  if (!rates.length) {
    const why = (shipment.messages || []).map((m) => m.text).filter(Boolean).join(" ");
    const acct = why.match(/master account from ([A-Z]{2})/i)?.[1]?.toUpperCase();
    if (acct && acct !== "US") throw new Error(`Your Shippo account is set up for ${acct === "CA" ? "Canada" : acct}, so it can't buy US UPS labels. In Shippo open Settings → Account (or sign up again) with United States as the country and a US address (your warehouse works), then try again.`);
    if (/out of service area/i.test(why)) throw new Error("UPS says this address is outside its service area. Check the customer's address (street, city, state, ZIP) on the sale.");
    throw new Error(`No ${cfg.carrier} rates for this address.${why ? " " + why : " Check the customer's address."}`.slice(0, 300));
  }
  return { from, rates: rates.sort((a, b) => a.price - b.price).slice(0, 6), test: cfg.test, maxPrice: cfg.maxPrice };
}

// Buy a label: the rate the admin picked (rateId), or the cheapest one (automatic mode).
// Shippo charges the card saved on the Shippo account (Settings → Billing).
export async function createReturnLabel(sale, cfg, { rateId } = {}) {
  cfg = cfg || (await returnConfig());
  if (!cfg) throw new Error("Return labels aren't set up yet. Add Shippo in Admin → Connectors → Return labels.");
  let best;
  if (rateId) {
    const r = await fetch(`${API}/rates/${encodeURIComponent(rateId)}`, { headers: { authorization: `ShippoToken ${cfg.key}` } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.object_id) throw new Error("That price expired. Press “Make return label” again for fresh prices.");
    best = { id: d.object_id, provider: d.provider, service: d.servicelevel?.name || "", price: Number(d.amount) };
  } else {
    const q = await quoteRates(sale, cfg);
    best = q.rates[0];
    if (best.price > cfg.maxPrice) throw new Error(`Cheapest ${best.provider} label is $${best.price.toFixed(2)}, above your $${cfg.maxPrice} limit. Raise "Max price" in Connectors if that's OK.`);
  }
  const tx = await shippo(cfg, "/transactions/", { rate: best.id, label_file_type: "PDF_4x6", async: false });
  if (tx.status !== "SUCCESS" || !tx.label_url) {
    const why = (tx.messages || []).map((m) => m.text).join(" ") || tx.status || "unknown error";
    throw new Error(/billing|payment|credit card|card/i.test(why) ? "Shippo couldn't charge your card. Add or update the card in Shippo → Settings → Billing, then try again." : "Shippo couldn't create the label: " + why.slice(0, 300));
  }
  return {
    returnLabelUrl: tx.label_url, returnTracking: tx.tracking_number || null, returnCost: best.price,
    returnService: `${best.provider} ${best.service || ""}`.trim() + (cfg.test ? " (TEST)" : ""),
    returnLabelAt: new Date(), returnError: null,
  };
}

export function labelEmail(sale, label, company) {
  const first = String(sale.customer || "").split(" ")[0] || "there";
  const carrier = String(label.returnService || "UPS").split(" ")[0];
  return {
    subject: `Your prepaid return label${sale.orderNumber ? " — order #" + sale.orderNumber : ""}`,
    body: `Hi ${first},\n\nHere is your prepaid ${label.returnService.replace(" (TEST)", "")} return label:\n${label.returnLabelUrl}\n\n1. Print the label and tape it on the box.\n2. Drop the box at any ${carrier} location (or hand it to a ${carrier} driver).\n${label.returnTracking ? `\nTracking number: ${label.returnTracking}\n` : ""}\nThank you${company ? ",\n" + company : "!"}`,
  };
}

// Make the label (or reuse the saved one), store it on the sale and email it to the customer if set.
export async function makeLabel(sale, { again = false, emailOnly = false, cfg, rateId } = {}) {
  cfg = cfg || (await returnConfig());
  let label = sale.returnLabelUrl ? { returnLabelUrl: sale.returnLabelUrl, returnTracking: sale.returnTracking, returnCost: sale.returnCost, returnService: sale.returnService } : null;
  if (!emailOnly && (!label || again)) {
    try {
      label = await createReturnLabel(sale, cfg, { rateId });
    } catch (e) {
      const s = await db.sale.update({ where: { id: sale.id }, data: { returnError: e.message.slice(0, 300) }, select: FIELDS });
      await feed(`⚠ ${tag(sale)} return label failed: ${e.message.slice(0, 200)}`);
      return { error: e.message, sale: s };
    }
    await db.sale.update({ where: { id: sale.id }, data: label });
    await feed(`🏷 ${tag(sale)} return label ${again ? "remade" : "made"}: ${label.returnService || "UPS"}${label.returnCost != null ? " · " + money(label.returnCost) : ""}${label.returnTracking ? " · tracking " + label.returnTracking : ""}`);
  }
  if (!label) return { error: "Make the label first." };
  let emailed = false, emailError = null;
  if ((emailOnly || cfg?.emailCustomer) && sale.email) {
    try {
      const company = (await getSettings().catch(() => ({}))).companyName || "";
      const m = labelEmail(sale, label, company);
      await sendMail({ to: sale.email, subject: m.subject, body: m.body, fromName: company || undefined });
      emailed = true;
    } catch (e) { emailError = "Label made, but the email didn't send: " + e.message; }
  }
  if (emailed) await feed(`✉️ ${tag(sale)} return label emailed to ${sale.email}`);
  const s = await db.sale.findUnique({ where: { id: sale.id }, select: FIELDS });
  return { sale: s, emailed, emailError };
}
