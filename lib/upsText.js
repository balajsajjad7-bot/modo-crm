// Read the package step from text copied off UPS's tracking page (or read from it by the add-on/app).
// UPS puts the current status at the top ("On the Way", "Delivered", …), so the earliest headline wins.
const PHRASES = [
  [/\bout for delivery\b/i, "out_for_delivery"],
  [/\bdelivered\b(?! by end of day| by)/i, "delivered"],
  [/\bon the way\b/i, "in_transit"],
  [/\bin transit\b/i, "in_transit"],
  [/\bwe have your package\b/i, "dropped_off"],
  [/\bdrop-?off\b|\bdropped off\b/i, "dropped_off"],
  [/\breturned to sender\b|\breturning to (the )?sender\b/i, "returned"],
  [/\bdelivery attempted\b|\bexception\b|\baction required\b|\bdelayed\b/i, "exception"],
  [/\blabel created\b|\bshipper created a label\b/i, "label"],
];
export function detectUps(text, num) {
  const body = String(text || ""); if (!body.trim()) return null;
  const at = num ? body.toUpperCase().indexOf(String(num).toUpperCase()) : -1;
  const zone = at >= 0 ? body.slice(Math.max(0, at - 400)) : body;
  let best = null;
  for (const [re, st] of PHRASES) { const m = zone.match(re); if (m && (!best || m.index < best.i)) best = { i: m.index, st }; }
  if (!best) return null;
  const line = zone.slice(best.i, best.i + 160).split(/\n/).slice(0, 2).join(" · ").replace(/\s+/g, " ").trim();
  const eta = zone.match(/(?:estimated delivery|scheduled delivery|delivered on|arriving)[:\s]*([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?)/i)?.[0];
  return { status: best.st, stage: (eta && !line.includes(eta.slice(0, 20)) ? line + " · " + eta : line).slice(0, 200) };
}
