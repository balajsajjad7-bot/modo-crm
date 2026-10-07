// Contract e-signatures: the agent types their full name and draws their signature. Stored with the time,
// network address and a fingerprint of the exact contract text — if the contract is changed later, the agent
// is asked to sign the new version.
import crypto from "crypto";
import { db } from "./db";

export const contractHash = (text) => crypto.createHash("sha256").update(String(text || "").trim()).digest("hex").slice(0, 24);
const id = (uid) => "contract-sign-" + uid;
export async function getSign(uid) {
  const b = await db.fileBlob.findUnique({ where: { id: id(uid) } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : null; } catch { return null; }
}
export async function saveSign(uid, v) {
  const data = Buffer.from(JSON.stringify(v), "utf8");
  await db.fileBlob.upsert({ where: { id: id(uid) }, update: { data, size: data.length }, create: { id: id(uid), userId: uid, name: "contract-signature", mime: "application/json", size: data.length, data } });
}
export async function signStatus(uid, contract) {
  const sg = await getSign(uid);
  if (!contract) return { required: false, signed: false };
  const ok = !!sg && sg.hash === contractHash(contract);
  return { required: true, signed: ok, signedAt: ok ? sg.at : null, signedName: ok ? sg.name : null, image: ok ? sg.image : null, outdated: !!sg && !ok };
}
