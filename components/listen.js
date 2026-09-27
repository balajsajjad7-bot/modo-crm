"use client";
// Live listen-in over WebRTC. The agent's browser SENDS two audio streams (their mic + the customer from the dialer tab);
// the admin's browser RECEIVES them. Audio goes directly between the two browsers and is never stored.
const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
let iceCache = null;
const ice = async () => (iceCache ||= (await fetch("/api/huddle/ice").then((r) => r.json()).catch(() => ({ iceServers: [] }))).iceServers);

function loop(id, onSignal, onEnded) {
  let stop = false;
  const tick = async () => {
    if (stop) return;
    const d = await fetch("/api/listen/signal?id=" + id, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ended) { onEnded(); return; }
    for (const s of d?.signals || []) { try { await onSignal(s); } catch (e) { console.warn("listen signal", e); } }
    setTimeout(tick, 1000);
  };
  tick();
  return () => { stop = true; };
}

// Agent side: send { agent: MediaStream, customer?: MediaStream } to the admin.
export async function startSending(id, streams, onEnded) {
  const pc = new RTCPeerConnection({ iceServers: await ice() });
  const meta = {};
  for (const [who, st] of Object.entries(streams)) { if (!st) continue; meta[st.id] = who; st.getAudioTracks().forEach((t) => pc.addTrack(t, st)); }
  pc.onicecandidate = (e) => e.candidate && post("/api/listen/signal", { id, type: "ice", payload: e.candidate.toJSON() });
  const pending = [];
  const stopLoop = loop(id, async (s) => {
    if (s.type === "answer") { await pc.setRemoteDescription(s.payload); for (const c of pending.splice(0)) await pc.addIceCandidate(c).catch(() => {}); }
    else if (s.type === "ice") { if (pc.remoteDescription) await pc.addIceCandidate(s.payload).catch(() => {}); else pending.push(s.payload); }
  }, () => { close(); onEnded?.(); });
  await post("/api/listen/signal", { id, type: "meta", payload: meta });
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  await post("/api/listen/signal", { id, type: "offer", payload: pc.localDescription.toJSON() });
  const close = () => { stopLoop(); try { pc.close(); } catch {} };
  return { close };
}

// Admin side: receive and hand back each stream labelled "agent" / "customer".
export async function startListening(callSessionId, onStream, onEnded) {
  const r = await post("/api/listen", { callSessionId });
  if (!r.id) throw new Error(r.error || "Couldn't start listening.");
  const id = r.id; let meta = {}; let pc = null; const pending = [];
  const make = async () => {
    try { pc?.close(); } catch {}
    pc = new RTCPeerConnection({ iceServers: await ice() });
    pc.onicecandidate = (e) => e.candidate && post("/api/listen/signal", { id, type: "ice", payload: e.candidate.toJSON() });
    pc.ontrack = (e) => { const st = e.streams[0]; if (st) onStream(meta[st.id] || "agent", st); };
    return pc;
  };
  const stopLoop = loop(id, async (s) => {
    if (s.type === "meta") meta = s.payload || {};
    else if (s.type === "offer") { // a new offer = the agent's streams changed (e.g. customer audio added)
      const p = await make(); await p.setRemoteDescription(s.payload);
      for (const c of pending.splice(0)) await p.addIceCandidate(c).catch(() => {});
      const ans = await p.createAnswer(); await p.setLocalDescription(ans);
      await post("/api/listen/signal", { id, type: "answer", payload: p.localDescription.toJSON() });
    } else if (s.type === "ice") { if (pc?.remoteDescription) await pc.addIceCandidate(s.payload).catch(() => {}); else pending.push(s.payload); }
  }, () => { try { pc?.close(); } catch {} onEnded?.(); });
  return { id, close: async () => { stopLoop(); try { pc?.close(); } catch {} await post("/api/listen/stop", { id }); } };
}
