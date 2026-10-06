// Modo bot → #sales-updates: a private chat channel for admins where every change to every sale is posted.
import { db } from "./db";

const FEED = "sales-feed";
let _ready = 0;
async function ensure() {
  if (Date.now() - _ready < 10 * 60000) return;
  await db.conversation.upsert({ where: { id: FEED }, update: {}, create: { id: FEED, name: "sales-updates", isGroup: true, isChannel: true, isPrivate: true, topic: "Modo bot: every change to every sale, as it happens" } });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (admins.length) await db.convMember.createMany({ data: admins.map((u) => ({ conversationId: FEED, userId: u.id })), skipDuplicates: true });
  _ready = Date.now();
}

const money = (n) => (n == null || n === "" ? "" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
export const tag = (s) => `#${s?.orderNumber || s?.receipt || "sale"}${s?.customer ? ` · ${s.customer}` : ""}`;
export { money };

// Post one line. Never throws: the sale change itself must never fail because of the feed.
export async function feed(text) {
  try {
    await ensure();
    await db.message.create({ data: { conversationId: FEED, userId: "modo-bot", kind: "TEXT", text: String(text).slice(0, 1500) } });
    await db.conversation.update({ where: { id: FEED }, data: { lastMessageAt: new Date() } });
  } catch {}
}
