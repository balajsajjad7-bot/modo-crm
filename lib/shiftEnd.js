import crypto from "crypto";
import { db } from "./db";
import { resolveShift, shiftBounds } from "./payroll";

export const hash = (code) => crypto.createHash("sha256").update(String(code) + (process.env.JWT_SECRET || "")).digest("hex");
export const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

// Is the agent still inside their scheduled shift? (5-minute grace before the end)
export function beforeShiftEnd(user, now = new Date()) {
  const { shiftDate } = resolveShift(user, now);
  const { end } = shiftBounds(user, shiftDate);
  return { early: now.getTime() < end.getTime() - 5 * 60000, end, shiftDate };
}

// Direct message from admin to agent (creates the DM if they've never chatted)
export async function dm(fromId, toId, text) {
  const mine = await db.convMember.findMany({ where: { userId: fromId }, select: { conversationId: true } });
  const both = await db.conversation.findFirst({ where: { id: { in: mine.map((m) => m.conversationId) }, isGroup: false, isChannel: false, members: { some: { userId: toId } } } });
  const c = both || await db.conversation.create({ data: { createdById: fromId, members: { create: [{ userId: fromId }, { userId: toId }] } } });
  await db.message.create({ data: { conversationId: c.id, userId: fromId, kind: "TEXT", text } });
  await db.conversation.update({ where: { id: c.id }, data: { lastMessageAt: new Date() } });
}
