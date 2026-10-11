"use client";
// Sign out that can't get stuck: hang up any call (max 2s), clear the session cookie (max 5s), wipe this tab's data,
// then go to the sign-in page whatever happened. replace() so Back doesn't return to the signed-in page.
const within = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise((ok) => setTimeout(ok, ms))]);
export async function signOutNow(leaveCall) {
  try { await within(leaveCall?.(), 2000); } catch {}
  await within(fetch("/api/auth/logout", { method: "POST", cache: "no-store", credentials: "same-origin" }), 5000);
  try { sessionStorage.clear(); } catch {}
  location.replace("/login");
}
