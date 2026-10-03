"use client";
// Voice calls / huddles over WebRTC (audio only, peer-to-peer mesh).
// Signalling goes through /api/huddle (polled every second), so no extra server is needed.
import { useCallback, useEffect, useRef, useState } from "react";

const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().then((d) => ({ ok: r.ok, data: d })));

export function useHuddle(meId) {
  const [call, setCall] = useState(null); // { id, participants, startedAt, conversationId, startedById }
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState({}); // peerId -> state
  const r = useRef({ id: null, stream: null, pcs: new Map(), pendingIce: new Map(), ice: null, timer: null, audio: null });

  const send = (to, type, payload) => post("/api/huddle/signal", { huddleId: r.current.id, to, type, payload });

  const closePeer = (peerId) => {
    const pc = r.current.pcs.get(peerId);
    if (pc) { try { pc.close(); } catch {} r.current.pcs.delete(peerId); }
    document.getElementById("huddle-audio-" + peerId)?.remove();
    setConnected((c) => { const n = { ...c }; delete n[peerId]; return n; });
  };

  const makePeer = (peerId) => {
    const pc = new RTCPeerConnection({ iceServers: r.current.ice });
    r.current.stream.getTracks().forEach((t) => pc.addTrack(t, r.current.stream));
    pc.onicecandidate = (e) => { if (e.candidate) send(peerId, "ice", e.candidate.toJSON()); };
    pc.ontrack = (e) => {
      let el = document.getElementById("huddle-audio-" + peerId);
      if (!el) { el = document.createElement("audio"); el.id = "huddle-audio-" + peerId; el.autoplay = true; el.playsInline = true; r.current.audio.appendChild(el); }
      el.srcObject = e.streams[0];
      el.play?.().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      setConnected((c) => ({ ...c, [peerId]: pc.connectionState }));
      if (pc.connectionState === "failed") closePeer(peerId); // recreated on next poll
      if (pc.connectionState === "disconnected") setTimeout(() => { if (r.current.pcs.get(peerId) === pc && pc.connectionState === "disconnected") closePeer(peerId); }, 6000);
    };
    r.current.pcs.set(peerId, pc);
    return pc;
  };

  const flushIce = async (peerId, pc) => {
    const q = r.current.pendingIce.get(peerId) || [];
    r.current.pendingIce.delete(peerId);
    for (const c of q) { try { await pc.addIceCandidate(c); } catch {} }
  };

  const handleSignal = async ({ from, type, payload }) => {
    let pc = r.current.pcs.get(from);
    if (type === "offer") {
      if (pc) closePeer(from); // a new offer always means a fresh connection
      pc = makePeer(from);
      await pc.setRemoteDescription(payload);
      await flushIce(from, pc);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await send(from, "answer", pc.localDescription.toJSON());
    } else if (type === "answer" && pc) {
      if (pc.signalingState === "have-local-offer") { await pc.setRemoteDescription(payload); await flushIce(from, pc); }
    } else if (type === "ice") {
      if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(payload); } catch {} }
      else r.current.pendingIce.set(from, [...(r.current.pendingIce.get(from) || []), payload]);
    }
  };

  const stopAll = useCallback(() => {
    clearTimeout(r.current.timer);
    for (const id of [...r.current.pcs.keys()]) closePeer(id);
    r.current.stream?.getTracks().forEach((t) => t.stop());
    r.current = { ...r.current, id: null, stream: null, pcs: new Map(), pendingIce: new Map(), timer: null };
    setCall(null); setMuted(false); setConnected({});
  }, []);

  const poll = useCallback(async () => {
    const id = r.current.id; if (!id) return;
    try {
      const res = await fetch("/api/huddle?id=" + id, { cache: "no-store" });
      const d = await res.json();
      if (r.current.id !== id) return;
      if (d.ended || !res.ok) { stopAll(); return; }
      for (const sig of d.signals) { try { await handleSignal(sig); } catch (e) { console.warn("signal", e); } }
      const others = d.participants.filter((p) => p.id !== meId);
      const ids = new Set(others.map((p) => p.id));
      for (const peerId of [...r.current.pcs.keys()]) if (!ids.has(peerId)) closePeer(peerId);
      // The person with the smaller id sends the offer, so two people never offer at once.
      for (const p of others) if (!r.current.pcs.has(p.id) && meId < p.id) {
        const pc = makePeer(p.id);
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        await send(p.id, "offer", pc.localDescription.toJSON());
      }
      setCall({ id, ...d });
    } catch (e) { console.warn("huddle poll", e); }
    if (r.current.id === id) r.current.timer = setTimeout(poll, 1000);
  }, [meId, stopAll]);

  const enter = async (action, body) => {
    setError("");
    if (r.current.id) stopAll();
    if (!navigator.mediaDevices?.getUserMedia) { setError("Calls need a secure page (https or localhost) and a microphone."); return false; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { setError("Microphone is blocked. Allow it in the browser address bar and try again."); return false; }
    const res = await post("/api/huddle", { action, ...body });
    if (!res.ok) { stream.getTracks().forEach((t) => t.stop()); setError(res.data.error); return false; }
    const ice = await fetch("/api/huddle/ice").then((x) => x.json()).catch(() => ({ iceServers: [] }));
    r.current.ice = ice.iceServers; r.current.stream = stream; r.current.id = res.data.huddleId;
    setCall({ id: res.data.huddleId, participants: [] });
    poll();
    return true;
  };

  const start = (conversationId) => enter("start", { conversationId });
  const join = (huddleId) => enter("join", { huddleId });
  const leave = async () => { const id = r.current.id; stopAll(); if (id) await post("/api/huddle", { action: "leave", huddleId: id }); };
  const endForAll = async () => { const id = r.current.id; stopAll(); if (id) await post("/api/huddle", { action: "end", huddleId: id }); };
  const toggleMute = async () => {
    const next = !muted; setMuted(next);
    r.current.stream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (r.current.id) post("/api/huddle", { action: "mute", huddleId: r.current.id, muted: next });
  };
  const audioRef = useCallback((el) => { r.current.audio = el; }, []);

  useEffect(() => {
    const bye = () => { if (r.current.id) navigator.sendBeacon?.("/api/huddle/leave-beacon?id=" + r.current.id); };
    window.addEventListener("pagehide", bye);
    return () => { window.removeEventListener("pagehide", bye); };
  }, []);

  const getStreams = useCallback(() => {
    const out = r.current.stream ? [r.current.stream] : [];
    r.current.audio?.querySelectorAll("audio").forEach((a) => a.srcObject && out.push(a.srcObject));
    return out;
  }, []);
  return { call, muted, error, connected, start, join, leave, endForAll, toggleMute, audioRef, getStreams, clearError: () => setError("") };
}
