import webpush from "web-push";
import { db } from "./db";

// VAPID keys — default to this instance's generated pair so push works out of the box.
// Override with env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT) to rotate.
const PUBLIC = process.env.VAPID_PUBLIC_KEY || "BOzZ_T5SYo3Dt4vdxIgT0T4exWJie4W7u1xlmwMDT6GHNyFr8gCl8wRnoNWRxaR_HpxbvRXA1Cq2UGqSc__KzWE";
const PRIVATE = process.env.VAPID_PRIVATE_KEY || "L2ybS3Lc8mDKmZXsn2IwqxM9EKWuzePpmrXd03JpH28";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:alerts@crmmodo.app";

let ready = false;
function init() { if (ready) return; try { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE); ready = true; } catch {} }
export const vapidPublic = () => PUBLIC;

// Send a push to every device of the given user id(s). Dead subscriptions are pruned.
export async function sendPush(userIds, payload) {
  init();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (!ids.length) return;
  const subs = await db.pushSub.findMany({ where: { userId: { in: ids } } }).catch(() => []);
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  await Promise.allSettled(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 600, urgency: payload.urgent ? "high" : "normal" }); }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) await db.pushSub.delete({ where: { id: s.id } }).catch(() => {}); }
  }));
}
