// Mobile-carrier detection + display info for the customer's store card.
// We read whatever carrier the customer is associated with from the sale (product/raw/summary/notes),
// then the map card finds that carrier's nearest retail store.

export const CARRIERS = {
  verizon: { id: "verizon", label: "Verizon", color: "#ee0000", fg: "#fff", queries: ["Verizon", "Verizon Authorized Retailer"], rx: /verizon|vzw|\bvz\b/i, brandRx: /verizon/i, store: "Verizon store" },
  att:     { id: "att",     label: "AT&T",    color: "#00a8e0", fg: "#fff", queries: ["AT&T Store", "AT&T"], rx: /at\s*&\s*t|\batt\b|at and t/i, brandRx: /at\s*&?\s*t/i, store: "AT&T store" },
  tmobile: { id: "tmobile", label: "T-Mobile", color: "#e20074", fg: "#fff", queries: ["T-Mobile", "Metro by T-Mobile"], rx: /t[-\s]?mobile|tmobile|metro by t|\btmo\b/i, brandRx: /t[-\s]?mobile|metro by t/i, store: "T-Mobile store" },
  cricket: { id: "cricket", label: "Cricket", color: "#60b000", fg: "#fff", queries: ["Cricket Wireless"], rx: /cricket/i, brandRx: /cricket/i, store: "Cricket store" },
  boost:   { id: "boost",   label: "Boost Mobile", color: "#f7941e", fg: "#111", queries: ["Boost Mobile"], rx: /boost/i, brandRx: /boost/i, store: "Boost store" },
  spectrum:{ id: "spectrum",label: "Spectrum Mobile", color: "#0073d1", fg: "#fff", queries: ["Spectrum"], rx: /spectrum|charter/i, brandRx: /spectrum/i, store: "Spectrum store" },
  xfinity: { id: "xfinity", label: "Xfinity Mobile", color: "#000000", fg: "#fff", queries: ["Xfinity"], rx: /xfinity|comcast/i, brandRx: /xfinity/i, store: "Xfinity store" },
};

export const carrierInfo = (id) => CARRIERS[String(id || "").toLowerCase()] || null;

// What carrier is this customer on? Read the sale's own text — longest/most specific match wins.
export function detectCarrier(sale) {
  if (!sale) return null;
  // Scan everything the sale carries about its carrier — including the campaign the customer is
  // associated with (e.g. the "Verizon" / "AT&T" campaign), the office, and the gift/plan fields.
  const hay = [sale.carrierName, sale.campaignName, sale.campaign, sale.product, sale.summary,
    sale.device, sale.specs, sale.gift, sale.office, sale.saleType, sale.notes, sale.raw, sale.flags]
    .filter(Boolean).join(" \n ");
  if (!hay) return null;
  // Check the more specific MVNOs before the big three so "Metro by T-Mobile" etc. resolve correctly.
  const order = ["cricket", "boost", "spectrum", "xfinity", "tmobile", "att", "verizon"];
  for (const id of order) if (CARRIERS[id].rx.test(hay)) return CARRIERS[id].id;
  return null;
}
