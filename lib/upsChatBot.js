// Modo bot → #ups-bot: a private admins-only chat. Type a tracking number and which sale it belongs to
// (order number, receipt or customer name) and the bot saves it on the sale and checks UPS right away.
// You can also tell it the status yourself ("delivered 1Z…") when UPS tracking isn't connected.
import { db } from "./db";
import { runBot, UPS_LABEL } from "./upsBot";
import { feed, tag } from "./salesFeed";

export const UPSBOT = "ups-bot";
let _ready = 0;

export async function ensureUpsBot() {
  if (Date.now() - _ready < 10 * 60000) return;
  await db.conversation.upsert({ where: { id: UPSBOT }, update: {}, create: { id: UPSBOT, name: "ups-bot", isGroup: true, isChannel: true, isPrivate: true, topic: "Send a tracking number + order number or customer name — the bot adds it to the sale and checks UPS" } });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: UPSBOT, userId: u.id })), skipDuplicates: true });
  _ready = Date.now();
}

const ICON = { delivered: "✅", out_for_delivery: "🚚", in_transit: "📦", dropped_off: "🏪", exception: "⚠️", returned: "↩️", label: "🏷" };
// Words that mean "set this status yourself"
const STATUS_WORDS = [
  [/out\s*for\s*delivery|ofd/i, "out_for_delivery"], [/delivered/i, "delivered"], [/in\s*transit|on\s*the\s*way|shipped/i, "in_transit"],
  [/dropped(\s*off)?|drop\s*off/i, "dropped_off"], [/label(\s*(made|created))?/i, "label"], [/exception|problem|issue|delay(ed)?/i, "exception"], [/returned(\s*to\s*sender)?|rts/i, "returned"],
].map(([re, st]) => [new RegExp("\\b(?:" + re.source + ")\\b", "i"), st]); // whole words only ("Roberts" isn't "rts")
const carrierOf = (n) => (/^1Z/i.test(n) ? "ups" : /^(94|93|92|95)\d{18,20}$|^[A-Z]{2}\d{9}US$/i.test(n) ? "usps" : /^\d{12}$|^\d{15}$/.test(n) ? "fedex" : "ups");
const trackUrl = (n, c) => (c === "usps" ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` : c === "fedex" ? `https://www.fedex.com/fedextrack/?trknbr=${n}` : `https://www.ups.com/track?tracknum=${n}`);
const SEL = { id: true, orderNumber: true, receipt: true, customer: true, device: true, trackingNo: true, returnTracking: true, carrier: true, upsStatus: true, upsStage: true, createdAt: true };
const line = (s) => `• ${tag(s)}${s.device ? " · " + s.device : ""}${s.trackingNo ? " · tracking " + s.trackingNo : " · no tracking yet"}`;

const HELP = `How to use me:
• 1Z999AA10123456784 #12345 → adds the tracking number to sale #12345 and checks UPS
• 1Z999AA10123456784 John Smith → finds the sale by customer name
• return 1Z999AA10123456784 #12345 → saves it as the return package instead
• 1Z999AA10123456784 → checks UPS again for the sale that already has it
• delivered 1Z999AA10123456784 (or out for delivery / in transit / dropped off / problem / returned) → set the status yourself
• list → recent sales that still need a tracking number`;

async function findSales(ref) {
  const r = ref.replace(/^#/, "").trim();
  if (!r) return [];
  const exact = await db.sale.findMany({ where: { status: { not: "REJECTED" }, OR: [{ orderNumber: { equals: r, mode: "insensitive" } }, { receipt: { equals: r, mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, take: 5, select: SEL });
  if (exact.length) return exact;
  if (r.length < 3) return [];
  return db.sale.findMany({ where: { status: { not: "REJECTED" }, OR: [{ customer: { contains: r, mode: "insensitive" } }, { orderNumber: { contains: r, mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, take: 6, select: SEL });
}

async function check(sale, num, carrier) {
  const r = await runBot({ id: sale.id }).catch((e) => ({ ok: false, error: e.message }));
  const url = trackUrl(num, carrier);
  if (r.needsSetup) return `I can't read ${carrier.toUpperCase()} automatically yet (connect UPS tracking in Connectors). Check it here: ${url}\nThen tell me the step, e.g. "in transit ${num}".`;
  const s = await db.sale.findUnique({ where: { id: sale.id }, select: { upsStatus: true, upsStage: true, upsEta: true, upsError: true } });
  if (s?.upsError && !s.upsStatus) return `UPS didn't answer yet (${s.upsError}). I'll keep checking. Track it here: ${url}`;
  if (!s?.upsStatus) return `No scans yet — UPS may not have the package. I'll keep checking. ${url}`;
  return `${ICON[s.upsStatus] || "📦"} ${UPS_LABEL[s.upsStatus] || s.upsStatus}${s.upsStage && s.upsStage !== UPS_LABEL[s.upsStatus] ? " — " + s.upsStage : ""}${s.upsEta ? "\nExpected: " + new Date(s.upsEta).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""}\n${url}`;
}

// Returns the bot's reply text for one message in #ups-bot.
export async function handleUpsBot(text, user) {
  const raw = String(text || "").trim();
  if (!raw || /^(help|\?|hi|hello)$/i.test(raw)) return HELP;
  if (/^list$/i.test(raw)) {
    const need = await db.sale.findMany({ where: { status: { not: "REJECTED" }, trackingNo: null }, orderBy: { createdAt: "desc" }, take: 8, select: SEL });
    return need.length ? "Sales without a tracking number:\n" + need.map(line).join("\n") + "\n\nReply: <tracking number> #<order number>" : "Every recent sale has a tracking number. 🎉";
  }
  // UPS 1Z… numbers first; a plain 12/15-digit number counts only if it isn't one of our order numbers.
  let m = raw.match(/\b(1Z[0-9A-Z]{16})\b/i) || raw.match(/\b(9[2-5]\d{18,20}|[A-Z]{2}\d{9}US|\d{20,22})\b/i);
  if (!m) {
    const n = raw.match(/\b(\d{15}|\d{12})\b/);
    if (n && !(await db.sale.findFirst({ where: { OR: [{ orderNumber: n[1] }, { receipt: n[1] }] }, select: { id: true } }))) m = n;
  }
  if (!m) return `I couldn't find a tracking number in that.\n\n${HELP}`;
  const num = m[1].toUpperCase();
  const carrier = carrierOf(num);
  let rest = raw.replace(m[0], " ");
  const isReturn = /\breturn\b/i.test(rest); rest = rest.replace(/\breturn\b/gi, " ");
  let status = null;
  for (const [re, st] of STATUS_WORDS) { if (re.test(rest)) { status = st; rest = rest.replace(re, " "); break; } }
  rest = rest.replace(/\b(for|sale|order|customer|is|to|the|tracking|number|no\.?|#)\b/gi, " ").replace(/[,:;]/g, " ").replace(/\s+/g, " ").trim();

  // Which sale? A sale that already has this number wins; otherwise the order number / receipt / name typed.
  let sale = await db.sale.findFirst({ where: { OR: [{ trackingNo: num }, { returnTracking: num }] }, select: SEL });
  if (!sale) {
    if (!rest) return `Which sale is ${num} for? Reply with the order number or customer name, e.g. "${num} #12345".\nType "list" to see sales without tracking.`;
    const found = await findSales(rest);
    if (!found.length) return `I couldn't find a sale for "${rest}". Try the order number (e.g. #12345) or the customer's full name. Type "list" to see sales without tracking.`;
    if (found.length > 1) return `More than one sale matches "${rest}":\n${found.map(line).join("\n")}\n\nReply with the order number, e.g. "${num} #${found[0].orderNumber || found[0].receipt}".`;
    sale = found[0];
    const field = isReturn ? "returnTracking" : "trackingNo";
    const prev = sale[field];
    const data = isReturn ? { returnTracking: num } : { trackingNo: num, carrier };
    await db.sale.update({ where: { id: sale.id }, data: { ...data, upsStatus: null, upsStage: null, upsEta: null, upsEvents: null, upsAt: null, upsError: null } });
    await feed(`🚚 ${tag(sale)} ${isReturn ? "return " : ""}tracking ${prev ? "changed to" : "added:"} ${num} (by ${user.name} in #ups-bot)`);
    sale = { ...sale, ...data };
    if (status) {
      // Number + status in one message: save both
      await db.sale.update({ where: { id: sale.id }, data: { upsStatus: status, upsStage: UPS_LABEL[status], upsAt: new Date(), upsSrc: `Set in #ups-bot by ${user.name}`, ...(status === "delivered" ? { deliveredAt: new Date() } : {}) } });
      return `Saved ${num} on ${tag(sale)}${isReturn ? " as the return package" : ""} and set it to ${ICON[status]} ${UPS_LABEL[status]}.`;
    }
    return `Saved ${num} on ${tag(sale)}${isReturn ? " as the return package" : ""}${prev ? ` (replaced ${prev})` : ""}. Checking UPS…\n` + (await check(sale, num, carrier));
  }

  if (status) {
    await db.sale.update({ where: { id: sale.id }, data: { upsStatus: status, upsStage: UPS_LABEL[status], upsAt: new Date(), upsSrc: `Set in #ups-bot by ${user.name}`, upsError: null, ...(status === "delivered" ? { deliveredAt: new Date() } : {}) } });
    if (status !== sale.upsStatus) await feed(`📦 ${tag(sale)} UPS: ${UPS_LABEL[status]} (set by ${user.name} in #ups-bot)`);
    return `${ICON[status]} ${tag(sale)} is now "${UPS_LABEL[status]}".`;
  }
  return `${num} is on ${tag(sale)}. Checking UPS…\n` + (await check(sale, num, carrierOf(num)));
}
