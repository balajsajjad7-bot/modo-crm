import { getSettings } from "./settings";
// Emergency stop: cached for a few seconds so every request doesn't hit the database.
let cache = { at: 0, v: null };
export async function lockState() {
  if (Date.now() - cache.at < 5000 && cache.v) return cache.v;
  try { const s = await getSettings(); cache = { at: Date.now(), v: { on: !!s.lockdown, message: s.lockdownMsg || "" } }; }
  catch { cache = { at: Date.now(), v: { on: false, message: "" } }; }
  return cache.v;
}
export const clearLockCache = () => { cache.at = 0; };
