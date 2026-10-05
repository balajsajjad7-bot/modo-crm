// Short "nearest UPS" line for a sale card (from the saved store list), without loading the map.
export const miles = (m) => (m == null ? "" : m < 160 ? `${Math.round(m * 3.28)} ft` : `${(m / 1609.34).toFixed(m < 16093 ? 1 : 0)} mi`);
export function nearestLine(sale) {
  try { const st = JSON.parse(sale.geoStores || "[]")[0]; return st ? `${st.name} · ${miles(st.m)}` : ""; } catch { return ""; }
}
