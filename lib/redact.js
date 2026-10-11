// Masks payment-card numbers and full SSNs in free text before it is saved (chat, notes, notepads, sales
// notes, complaints). Data that was never stored can't leak — not from the database, backups or a stolen laptop.
const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
// Card-shaped: 15–16 digits (spaces/dashes allowed) with a real card prefix and a valid checksum.
const CARD = /(?<![\d])(?:\d[ -]?){14,15}\d(?![\d])/g;
const isCard = (d) => (d.length === 15 && /^3[47]/.test(d)) || (d.length === 16 && /^(4|5[1-5]|2[2-7]|6011|65|62)/.test(d));
const SSN = /(?<![\d])(\d{3})[- ](\d{2})[- ](\d{4})(?![\d])/g;
export function redact(text) {
  if (text == null) return text;
  let s = String(text);
  s = s.replace(CARD, (m) => { const d = m.replace(/\D/g, ""); return isCard(d) && luhn(d) ? `[card ••••${d.slice(-4)}]` : m; });
  s = s.replace(SSN, (m, a, b, c) => (a === "000" || a === "666" || a[0] === "9" ? m : `[SSN •••-••-${c}]`));
  return s;
}
