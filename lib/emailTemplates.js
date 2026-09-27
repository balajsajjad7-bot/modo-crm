// Built-in templates. {{words}} are filled from the sale or customer.
export const TEMPLATES = [
  { id: "blank", name: "Blank", subject: "", body: "Hi {{customer}},\n\n\n\nBest regards,\n{{sender}}" },
  { id: "order", name: "Order confirmation", subject: "Your order #{{orderNumber}} is confirmed",
    body: "Hi {{customer}},\n\nThank you for your order. Here are your details:\n\nOrder number: {{orderNumber}}\nDevice: {{device}} {{storage}} {{deviceColor}}\nGift: {{gift}}\n\nYour bill was {{billBefore}} a month. With your {{discountPct}}% discount it is now {{billAfter}} a month.\nNext bill date: {{nextBillDate}}\n\nIf anything looks wrong, just reply to this email.\n\nBest regards,\n{{sender}}" },
  { id: "callback", name: "Sorry we missed you", subject: "We tried to reach you",
    body: "Hi {{customer}},\n\nWe tried calling you today about lowering your monthly bill but couldn't get through.\n\nReply to this email with a good time to call, and we'll ring you then.\n\nBest regards,\n{{sender}}" },
  { id: "quote", name: "Discount quote", subject: "Your savings quote",
    body: "Hi {{customer}},\n\nAs discussed, here's your quote:\n\nCurrent bill: {{billBefore}} / month\nDiscount: {{discountPct}}%\nNew bill: {{billAfter}} / month\n\nReply to this email or call us to go ahead.\n\nBest regards,\n{{sender}}" },
  { id: "welcome", name: "Welcome", subject: "Welcome aboard, {{customer}}",
    body: "Hi {{customer}},\n\nWelcome! Your account is all set. If you have any questions about your bill or your device, just reply to this email.\n\nBest regards,\n{{sender}}" },
];
const money = (n) => (n == null || n === "" || isNaN(Number(n)) ? "" : "$" + Number(n).toFixed(2));
export function fill(text, d = {}) {
  const vals = { ...d, billBefore: money(d.billBefore), billAfter: money(d.billAfter),
    nextBillDate: d.nextBillDate ? new Date(d.nextBillDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "" };
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vals[k] == null || vals[k] === "" ? "" : String(vals[k]))).replace(/[ \t]+\n/g, "\n");
}
