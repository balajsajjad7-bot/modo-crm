// Budget Ease helpers (shared by the API routes)
import crypto from "crypto";
export const SERVICES = ["electricity", "gas", "internet", "water", "phone", "cable/TV", "other"];
export const STATUSES = ["NEW", "FOLLOWUP", "APPROVED", "REJECTED"];
export const newConsumerId = () => "BES-" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 7);
export const digits = (s) => String(s || "").replace(/\D/g, "");
export const discountPct = (bill, pay) => (bill > 0 && pay >= 0 ? Math.round(((bill - pay) / bill) * 1000) / 10 : null);
export function ageOn(dob, now = new Date()) {
  const d = new Date(dob + "T00:00:00Z"); if (isNaN(d)) return null;
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth(); if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a;
}
