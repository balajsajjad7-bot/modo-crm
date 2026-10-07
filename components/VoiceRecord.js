"use client";
// Record from the microphone → text (Groq Whisper, free). Used for campaign speeches and pitch practice.
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";

export default function VoiceRecord({ onText, label = "Record", className = "ghost sm" }) {
  const [st, setSt] = useState("idle"); const [secs, setSecs] = useState(0); const [err, setErr] = useState("");
  const rec = useRef(null); const chunks = useRef([]); const timer = useRef(null);
  useEffect(() => () => { clearInterval(timer.current); try { rec.current?.stream?.getTracks().forEach((t) => t.stop()); } catch {} }, []);

  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); clearInterval(timer.current);
        setSt("busy");
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        const f = new FormData(); f.set("audio", new File([blob], "speech." + (/mp4/.test(blob.type) ? "m4a" : "webm"), { type: blob.type }));
        const res = await fetch("/api/ai/speeches/transcribe", { method: "POST", body: f }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, d: { error: "Network problem" } }));
        setSt("idle");
        if (res.ok && res.d.text) onText(res.d.text); else setErr(res.d.error || "Nothing was heard.");
      };
      rec.current = r; r.start(1000); setSt("rec"); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => { if (s >= 600) r.stop(); return s + 1; }), 1000);
    } catch { setErr("Allow the microphone to record."); }
  };
  const stop = () => { try { rec.current?.state === "recording" && rec.current.stop(); } catch {} };
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <span className="vr">
      {st === "rec" ? <button type="button" className={className + " vr-on"} onClick={stop}><Square size={13} /> Stop · {mm}</button>
        : st === "busy" ? <button type="button" className={className} disabled><Loader2 size={13} className="spin" /> Writing it down…</button>
        : <button type="button" className={className} onClick={start}><Mic size={13} /> {label}</button>}
      {err && <small className="err" style={{ marginLeft: 6 }}>{err}</small>}
    </span>
  );
}
