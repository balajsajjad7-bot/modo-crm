"use client";
// Server-relayed live listen (no TURN needed): the agent uploads short audio chunks to Modo,
// the admin pulls them and plays them back through a MediaSource for near-live monitoring.

const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json().then((d) => ({ ok: r.ok, data: d })).catch(() => ({ ok: r.ok, data: {} })));
const blobToB64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(blob); });
const b64ToBuf = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const MIME = 'audio/webm;codecs="opus"';

export const chunkListenSupported = () => typeof MediaSource !== "undefined" && MediaSource.isTypeSupported?.(MIME);

// Agent side: record the mic in 1.5s chunks and upload them for listen `id`.
export function startChunkSend(id, stream, onEnd) {
  let seq = 0, stopped = false, mr;
  const type = ["audio/webm;codecs=opus", "audio/webm"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
  try { mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined); } catch { return { close: () => {} }; }
  mr.ondataavailable = async (e) => { if (stopped || !e.data || !e.data.size) return; try { const b64 = await blobToB64(e.data); await post("/api/listen/audio", { id, seq: seq++, data: b64 }); } catch {} };
  try { mr.start(1500); } catch { return { close: () => {} }; }
  const poll = setInterval(async () => { try { const d = await fetch("/api/listen", { cache: "no-store" }).then((r) => r.json()); if (!(d?.requests || []).some((r) => r.id === id)) stop(); } catch {} }, 4000);
  const stop = () => { if (stopped) return; stopped = true; clearInterval(poll); try { mr.stop(); } catch {} onEnd?.(); };
  return { close: stop };
}

// Admin side: start a listen on `agentId`, pull chunks, play them. onStatus("connected") fires on first audio.
export async function startChunkListen(agentId, { onStatus, onEnded, audioEl }) {
  const r = await post("/api/listen", { agentId });
  if (!r.ok || !r.data.id) throw new Error(r.data.error || "Couldn't start listening.");
  const id = r.data.id;
  let sb = null, queue = [], lastSeq = -1, stopped = false, first = true;
  const ms = new MediaSource();
  audioEl.src = URL.createObjectURL(ms);
  const pump = () => { if (!sb || sb.updating || !queue.length || stopped) return; try { sb.appendBuffer(queue.shift()); } catch {} };
  ms.addEventListener("sourceopen", () => { try { sb = ms.addSourceBuffer(MIME); sb.mode = "sequence"; sb.addEventListener("updateend", pump); } catch {} });
  const tick = async () => {
    if (stopped) return;
    try {
      const d = await fetch(`/api/listen/audio?id=${id}&after=${lastSeq}`, { cache: "no-store" }).then((x) => x.json());
      if (d.ended) { onEnded?.(); return; }
      for (const c of (d.chunks || [])) { lastSeq = c.seq; queue.push(b64ToBuf(c.data)); if (first) { first = false; onStatus?.("connected"); audioEl.play?.().catch(() => {}); } }
      pump();
    } catch {}
    if (!stopped) setTimeout(tick, 900);
  };
  tick();
  const close = async () => { if (stopped) return; stopped = true; try { audioEl.pause(); } catch {} try { if (ms.readyState === "open") ms.endOfStream(); } catch {} await post("/api/listen/stop", { id }); };
  return { id, close };
}
