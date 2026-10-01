// Map a company/brand name to its domain so we can show a real logo.
// Telecom, big retail, and the US utilities Budget Ease works with.
export const BRAND_DOMAINS = {
  // Telecom / TV / internet
  "verizon": "verizon.com", "t-mobile": "t-mobile.com", "tmobile": "t-mobile.com", "at&t": "att.com", "att": "att.com",
  "sprint": "sprint.com", "comcast": "comcast.com", "xfinity": "xfinity.com", "spectrum": "spectrum.com", "cox": "cox.com",
  "frontier": "frontier.com", "optimum": "optimum.com", "dish": "dish.com", "directv": "directv.com", "centurylink": "centurylink.com",
  "mint mobile": "mintmobile.com", "metro": "metrobyt-mobile.com", "cricket": "cricketwireless.com", "boost": "boostmobile.com",
  // Retail / marketplaces
  "amazon": "amazon.com", "ebay": "ebay.com", "walmart": "walmart.com", "target": "target.com", "best buy": "bestbuy.com",
  "costco": "costco.com", "home depot": "homedepot.com", "lowe": "lowes.com", "apple": "apple.com", "google": "google.com",
  "microsoft": "microsoft.com", "netflix": "netflix.com", "etsy": "etsy.com", "wayfair": "wayfair.com", "shopify": "shopify.com",
  // Money transfer / fintech
  "western union": "westernunion.com", "westernunion": "westernunion.com", "moneygram": "moneygram.com", "paypal": "paypal.com",
  "venmo": "venmo.com", "cash app": "cash.app", "zelle": "zellepay.com",
  // US utilities
  "duke energy": "duke-energy.com", "florida power": "fpl.com", "fpl": "fpl.com", "georgia power": "georgiapower.com",
  "pacific gas": "pge.com", "pg&e": "pge.com", "southern california edison": "sce.com", "sce": "sce.com",
  "con edison": "coned.com", "coned": "coned.com", "comed": "comed.com", "dominion": "dominionenergy.com",
  "xcel": "xcelenergy.com", "entergy": "entergy.com", "aep": "aep.com", "pse&g": "pseg.com", "pseg": "pseg.com",
  "national grid": "nationalgrid.com", "eversource": "eversource.com", "consumers energy": "consumersenergy.com",
  "dte": "dteenergy.com", "ameren": "ameren.com", "centerpoint": "centerpointenergy.com", "oncor": "oncor.com",
  "txu": "txu.com", "reliant": "reliant.com", "socalgas": "socalgas.com", "atmos": "atmosenergy.com",
  "spire": "spireenergy.com", "american water": "amwater.com",
};

export function brandDomain(name) {
  const s = String(name || "").toLowerCase().trim();
  if (!s) return null;
  if (BRAND_DOMAINS[s]) return BRAND_DOMAINS[s];
  // longest key first so "southern california edison" wins over "edison"
  for (const k of Object.keys(BRAND_DOMAINS).sort((a, b) => b.length - a.length)) if (s.includes(k)) return BRAND_DOMAINS[k];
  return null;
}
