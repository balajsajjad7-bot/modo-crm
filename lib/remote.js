// Remote control: the admin sends commands to an agent's open Modo (message, lock screen, sign out, reload,
// open a page, end break, set status). Each agent's Modo checks in every few seconds, reports what page it's on,
// and runs whatever is waiting. One small blob per agent; nothing installed on the agent's computer.
import { db } from "./db";

const id = (uid) => "remote-" + uid;
async function load(uid) {
  const b = await db.fileBlob.findUnique({ where: { id: id(uid) } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : { q: [], seen: null, locked: null }; } catch { return { q: [], seen: null, locked: null }; }
}
async function save(uid, v) {
  const data = Buffer.from(JSON.stringify(v), "utf8");
  await db.fileBlob.upsert({ where: { id: id(uid) }, update: { data, size: data.length }, create: { id: id(uid), userId: uid, name: "remote", mime: "application/json", size: data.length, data } });
}

export const COMMANDS = ["message", "lock", "unlock", "logout", "reload", "open", "endBreak", "status"];

export async function sendCommand(uid, cmd, by) {
  const v = await load(uid);
  const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: cmd.type, text: String(cmd.text || "").slice(0, 500), url: String(cmd.url || "").slice(0, 200), status: String(cmd.status || "").slice(0, 20), by: by || "Admin", at: Date.now() };
  if (c.type === "lock") v.locked = { text: c.text || "Your screen was locked by your admin.", by: c.by, at: c.at };
  if (c.type === "unlock") v.locked = null;
  v.q = [...(v.q || []).filter((x) => Date.now() - x.at < 10 * 60000), c].slice(-20);
  await save(uid, v);
  return c;
}

// The agent's Modo checks in: report where it is, get waiting commands (and the lock state).
export async function poll(uid, state) {
  const v = await load(uid);
  const cmds = (v.q || []).filter((x) => Date.now() - x.at < 10 * 60000);
  v.q = []; v.seen = { ...state, at: Date.now() };
  await save(uid, v);
  return { cmds, locked: v.locked || null };
}

export async function snapshot(uids) {
  const out = {};
  await Promise.all(uids.map(async (u) => { const v = await load(u); out[u] = { seen: v.seen, locked: v.locked, waiting: (v.q || []).length }; }));
  return out;
}
