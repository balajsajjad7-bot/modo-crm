// Display helpers for WhatsApp chats (safe on the client and server).
// "WhatsApp · Donald Chapman +15058793626" → { name: "Donald Chapman", number: "+1 (505) 879-3626" }
export function fmtIntl(d) {
  d = String(d || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) d = "1" + d;
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.startsWith("92") && d.length === 12) return `+92 ${d.slice(2, 5)} ${d.slice(5)}`;
  if (d.startsWith("44") && d.length === 12) return `+44 ${d.slice(2, 6)} ${d.slice(6)}`;
  return "+" + d.replace(/(\d{2,3})(?=(\d{3,4})+$)/g, "$1 ");
}
export function waLabel(id = "", title = "") {
  const group = String(id).startsWith("wa-g-");
  const digits = group ? "" : String(id).replace(/^wa-/, "").replace(/\D/g, "");
  let name = String(title || "").replace(/^WhatsApp( group)? · /, "").replace(/\s*\(number hidden\)\s*$/, "").replace(/\s*\+\d{6,}\s*$/, "").trim();
  const number = digits.length >= 8 ? fmtIntl(digits) : "";
  if (!name || /^\+?\d[\d\s]*$/.test(name)) name = number || (group ? "WhatsApp group" : "Customer");
  return { name, number: name === number ? "" : number, digits, group, us: digits.length === 11 && digits[0] === "1" };
}
export const initialsOf = (s) => (String(s || "").replace(/[^\p{L}\p{N}\s]/gu, "").trim() || "#").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
