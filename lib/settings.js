import { db } from "./db";
export const getSettings = () => db.setting.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } });
export const ipAllowed = (s, ip) => !s.ipLock || s.officeIps.split(/[\s,]+/).filter(Boolean).includes(ip || "");
