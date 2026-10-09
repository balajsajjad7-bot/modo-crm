// Zoom interviews. Two ways: (1) your Zoom app keys (Server-to-Server OAuth) → Modo creates a fresh meeting for
// every interview; (2) no keys → every interview uses your personal Zoom meeting link.
export async function zoomToken({ accountId, clientId, clientSecret }) {
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`, {
    method: "POST", headers: { authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64") },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("Zoom sign-in failed: " + (d.reason || d.error || r.status) + ". Check the Account ID, Client ID and Client secret.");
  return d.access_token;
}
export async function createZoomMeeting(creds, { topic, startISO, mins = 30 }) {
  const token = await zoomToken(creds);
  const r = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ topic: String(topic).slice(0, 190), type: 2, start_time: new Date(startISO).toISOString().replace(/\.\d+Z$/, "Z"), duration: mins, timezone: "Asia/Karachi", settings: { waiting_room: true, join_before_host: false, host_video: true, participant_video: true, auto_recording: "none" } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Zoom couldn't create the meeting: " + (d.message || r.status));
  return { joinUrl: d.join_url, startUrl: d.start_url, meetingId: String(d.id || ""), passcode: d.password || "" };
}
export async function deleteZoomMeeting(creds, meetingId) {
  if (!meetingId) return;
  try { const token = await zoomToken(creds); await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, { method: "DELETE", headers: { authorization: "Bearer " + token } }); } catch {}
}
