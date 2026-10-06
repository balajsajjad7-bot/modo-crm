import { db } from "./db";

export const ACTIVE_MS = 20000; // a participant counts as "in the call" if seen in the last 20s
export const MAX_FILE = 4 * 1024 * 1024; // 4 MB (Netlify request limit is ~6 MB)

export const ONLINE_MS = 60000;
export const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥", "💯", "😮"];

// Everyone is always in #general.
export async function ensureEveryone() {
  await db.conversation.upsert({ where: { id: "everyone" }, update: {}, create: { id: "everyone", name: "general", isGroup: true, isChannel: true, topic: "Company-wide announcements and chat" } });
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  await db.convMember.createMany({ data: users.map((u) => ({ conversationId: "everyone", userId: u.id })), skipDuplicates: true });
}

export async function isMember(conversationId, userId) {
  return !!(await db.convMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } }));
}

export async function userMap(ids) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, agentId: true, role: true } });
  return Object.fromEntries(users.map((u) => [u.id, u]));
}

export async function activeHuddle(conversationId) {
  const since = new Date(Date.now() - ACTIVE_MS);
  const h = await db.huddle.findFirst({
    where: { conversationId, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: { participants: { where: { leftAt: null, lastSeen: { gte: since } } } },
  });
  if (!h) return null;
  if (!h.participants.length && Date.now() - h.startedAt > ACTIVE_MS) {
    await endHuddle(h.id);
    return null;
  }
  return h;
}

export async function endHuddle(huddleId) {
  const h = await db.huddle.update({ where: { id: huddleId }, data: { endedAt: new Date() } });
  await db.huddleParticipant.updateMany({ where: { huddleId, leftAt: null }, data: { leftAt: new Date() } });
  await db.signal.deleteMany({ where: { huddleId } });
  const mins = Math.max(1, Math.round((Date.now() - h.startedAt) / 60000));
  await systemMessage(h.conversationId, `Call ended · ${mins} min`);
  return h;
}

export async function systemMessage(conversationId, text, userId = "system") {
  await db.message.create({ data: { conversationId, userId, kind: "SYSTEM", text } });
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
}

// Messages with reactions and reply counts, ready for the chat screen.
export async function shapeAll(list, meId) {
  const ids = list.map((m) => m.id);
  const [reactions, replies] = await Promise.all([
    ids.length ? db.reaction.findMany({ where: { messageId: { in: ids } } }) : [],
    ids.length ? db.message.groupBy({ by: ["parentId"], where: { parentId: { in: ids }, deletedAt: null }, _count: { _all: true }, _max: { createdAt: true } }) : [],
  ]);
  const users = await userMap([...list.map((m) => m.userId), ...reactions.map((r) => r.userId)]);
  const rc = Object.fromEntries(replies.map((r) => [r.parentId, { count: r._count._all, lastAt: r._max.createdAt }]));
  return list.map((m) => {
    const rx = {};
    for (const r of reactions.filter((r) => r.messageId === m.id)) {
      rx[r.emoji] = rx[r.emoji] || { emoji: r.emoji, count: 0, mine: false, who: [] };
      rx[r.emoji].count++; rx[r.emoji].who.push(users[r.userId]?.name || "Someone"); if (r.userId === meId) rx[r.emoji].mine = true;
    }
    const gone = !!m.deletedAt;
    return {
      id: m.id, userId: m.userId, by: m.kind === "SYSTEM" ? null : users[m.userId]?.name || (m.userId === "modo-bot" ? "Modo bot 🤖" : String(m.userId).startsWith("wa:") ? "📱 Customer (WhatsApp)" : "Former user"), role: users[m.userId]?.role || (m.userId === "modo-bot" ? "BOT" : undefined),
      kind: gone ? "DELETED" : m.kind, text: gone ? null : m.text, at: m.createdAt, editedAt: m.editedAt, parentId: m.parentId,
      file: !gone && m.fileId ? { id: m.fileId, name: m.fileName, mime: m.fileMime, size: m.fileSize } : null,
      reactions: Object.values(rx), replies: rc[m.id] || null,
    };
  });
}

