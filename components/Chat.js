"use client";
import AiButton from "@/components/AiButton";
import CoachResult from "@/components/CoachResult";
// Slack-style team chat: #channels, direct & group messages, threads, reactions, @mentions,
// voice notes, attachments, edit/delete, presence and huddles/calls.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "./Shell";
import {
  Hash, Lock, Plus, ChevronDown, ChevronRight, Search, SquarePen, Headphones, Users, X, ArrowLeft,
  Paperclip, Mic, Send, Smile, AtSign, Trash2, Pencil, MessageSquareReply, FileText, Download, Compass, LogOut as Leave,
  GraduationCap, CheckCircle2, Circle, AlertTriangle, BookOpen, Brain, Sparkles, Truck,
} from "lucide-react";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥", "💯", "😮"];
const MAX = 4 * 1024 * 1024;
const TRAINING = "modo-training";
const COACH = "notepad-coach";
const UPSBOT = "ups-bot";
const GOT_IT = "✅";
const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const t = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayLabel = (d) => { const x = new Date(d), n = new Date(); const y = new Date(n); y.setDate(n.getDate() - 1);
  return x.toDateString() === n.toDateString() ? "Today" : x.toDateString() === y.toDateString() ? "Yesterday" : x.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }); };
const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + "m ago" : s < 86400 ? Math.floor(s / 3600) + "h ago" : Math.floor(s / 86400) + "d ago"; };
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const initials = (s) => (s || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const WARM = [4, 14, 24, 32, 356, 10];
const hue = (s) => WARM[[...(s || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % WARM.length];

export function Avatar({ name, size = 36, online, square = true }) {
  return (
    <span className="sl-avatar" style={{ width: size, height: size, borderRadius: square ? size * 0.22 : "50%", background: `hsl(${hue(name)} 55% 45%)`, fontSize: size * 0.38 }}>
      {initials(name)}{online != null && <i className={"presence" + (online ? " on" : "")} />}
    </span>
  );
}
export const ConvIcon = ({ c, size = 16 }) => c.id === TRAINING ? <GraduationCap size={size} /> : c.id === COACH ? <Brain size={size} /> : c.id === UPSBOT ? <Truck size={size} /> : c.kind === "channel" ? (c.isPrivate ? <Lock size={size - 2} /> : <Hash size={size} />) : c.kind === "group" ? <Users size={size - 2} /> : null;

// Turns text into React nodes: links and @mentions highlighted.
function RichText({ text, names, meName }) {
  const parts = useMemo(() => {
    const sorted = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(https?:\\/\\/[^\\s]+|@(?:${sorted.length ? sorted.join("|") + "|" : ""}channel|here))`, "g");
    return String(text || "").split(re);
  }, [text, names]);
  return parts.map((p, i) => {
    if (!p) return null;
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>;
    if (p.startsWith("@") && i % 2 === 1) return <span key={i} className={"mention" + (p.slice(1) === meName || p === "@channel" || p === "@here" ? " me" : "")}>{p}</span>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export default function Chat() {
  const { me, chat, reloadChat, huddle } = useShell();
  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [modal, setModal] = useState(null); // "channel" | "browse" | "dm" | "members"
  const [q, setQ] = useState("");
  const [fold, setFold] = useState({});
  const convs = chat.conversations;
  const conv = convs.find((c) => c.id === openId);
  useEffect(() => { try { const id = sessionStorage.getItem("modo-open-chat"); if (id) { sessionStorage.removeItem("modo-open-chat"); setOpenId(id); } } catch {} }, []);
  useEffect(() => { if (!openId && convs.length && typeof window !== "undefined" && window.innerWidth > 900) setOpenId(convs.find((c) => c.id === "everyone")?.id || convs[0].id); }, [convs, openId]);
  useEffect(() => { setThread(null); }, [openId]);

  const match = (c) => !q || c.title.toLowerCase().includes(q.toLowerCase());
  const channels = convs.filter((c) => c.kind === "channel" && match(c)).sort((a, b) => (b.id === TRAINING) - (a.id === TRAINING) || (b.id === COACH) - (a.id === COACH) || (b.id === UPSBOT) - (a.id === UPSBOT) || a.title.localeCompare(b.title));
  const dms = convs.filter((c) => c.kind !== "channel" && match(c));
  const open = (id) => { setOpenId(id); setModal(null); reloadChat(); };

  const Item = ({ c }) => (
    <button className={"sl-item" + (c.id === openId ? " on" : "") + (c.unread ? " unread" : "")} onClick={() => setOpenId(c.id)}>
      {c.kind === "dm" ? <Avatar name={c.title} size={20} online={c.online} /> : <span className="sl-ico"><ConvIcon c={c} /></span>}
      <span className="ellipsis">{c.title}</span>
      {c.huddle && <Headphones size={14} className="sl-huddle-ico" aria-label="Huddle in progress" />}
      {(c.mentions > 0 || ((c.kind !== "channel" || c.id === TRAINING || c.id === COACH || c.id === UPSBOT) && c.unread > 0)) && <span className="sl-badge">{c.kind === "channel" && c.id !== TRAINING && c.id !== COACH && c.id !== UPSBOT ? c.mentions : c.unread}</span>}
    </button>
  );
  const Section = ({ id, label, children, onAdd, addLabel }) => (
    <div className="sl-section">
      <div className="sl-section-head">
        <button className="sl-fold" onClick={() => setFold((f) => ({ ...f, [id]: !f[id] }))}>{fold[id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />} {label}</button>
        <button className="sl-add" aria-label={addLabel} title={addLabel} onClick={onAdd}><Plus size={15} /></button>
      </div>
      {!fold[id] && children}
    </div>
  );

  return (
    <div className={"slack" + (conv ? " has-open" : "") + (thread ? " has-thread" : "")}>
      <aside className="sl-side">
        <div className="sl-ws">
          <b>Modo</b>
          <button className="sl-icon" aria-label="New message" title="New message" onClick={() => setModal("dm")}><SquarePen size={17} /></button>
        </div>
        <label className="sl-search"><Search size={14} /><input placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" /></label>
        <div className="sl-scroll">
          <Section id="ch" label="Channels" onAdd={() => setModal("channel")} addLabel="Create a channel">
            {channels.map((c) => <Item key={c.id} c={c} />)}
            <button className="sl-item muted-item" onClick={() => setModal("browse")}><span className="sl-ico"><Compass size={15} /></span>Browse channels</button>
          </Section>
          <Section id="dm" label="Direct messages" onAdd={() => setModal("dm")} addLabel="New message">
            {dms.map((c) => <Item key={c.id} c={c} />)}
            {!dms.length && <p className="sl-empty">No direct messages yet.</p>}
          </Section>
        </div>
      </aside>

      <section className="sl-main">
        {conv ? <Conversation key={conv.id} conv={conv} me={me} huddle={huddle} reloadChat={reloadChat} onBack={() => setOpenId(null)}
          onThread={setThread} thread={thread} onMembers={() => setModal("members")} />
          : <div className="sl-blank"><Hash size={40} /><p>Pick a channel or person on the left, or start something new.</p><button onClick={() => setModal("channel")}>Create a channel</button></div>}
      </section>

      {conv && thread && <Thread conv={conv} me={me} parentId={thread} onClose={() => setThread(null)} />}

      {modal === "channel" && <CreateChannel onClose={() => setModal(null)} onDone={open} />}
      {modal === "browse" && <BrowseChannels onClose={() => setModal(null)} onOpen={open} />}
      {modal === "dm" && <NewMessage onClose={() => setModal(null)} onDone={open} />}
      {modal === "members" && conv && <Members conv={conv} me={me} onClose={() => setModal(null)} onChanged={reloadChat} onLeft={() => { setModal(null); setOpenId(null); reloadChat(); }} />}
    </div>
  );
}

function useMessages(convId, threadId) {
  const [msgs, setMsgs] = useState(null);
  const load = useMemo(() => async () => {
    const r = await api(`/api/chat/messages?c=${convId}${threadId ? "&thread=" + threadId : ""}`);
    if (r.ok) setMsgs(r.data);
  }, [convId, threadId]);
  useEffect(() => { setMsgs(null); load(); const i = setInterval(load, 2500); return () => clearInterval(i); }, [load]);
  return [msgs, load, setMsgs];
}

export function Conversation({ conv, me, huddle, reloadChat, onBack, onThread, thread, onMembers }) {
  const [msgs, reload] = useMessages(conv.id, null);
  const [editTopic, setEditTopic] = useState(false);
  const [topic, setTopic] = useState(conv.topic || "");
  const [lessonEdit, setLessonEdit] = useState(null); // null | {} (new) | message (edit)
  const training = conv.id === TRAINING;
  const coach = conv.id === COACH;
  const [coachBusy, setCoachBusy] = useState(false); const [coachErr, setCoachErr] = useState("");
  async function coachNow() { setCoachBusy(true); setCoachErr(""); const r = await api("/api/chat/notepad-coach", "POST", {}); setCoachBusy(false); if (!r.ok) setCoachErr(r.data.error || "The coach couldn't run."); reload(); reloadChat(); }
  const bottom = useRef(null); const lastCount = useRef(0);
  useEffect(() => { if (msgs && msgs.length !== lastCount.current) { bottom.current?.scrollIntoView({ block: "end" }); lastCount.current = msgs.length; } }, [msgs]);
  useEffect(() => { reloadChat(); }, [msgs?.length, reloadChat]);

  const names = conv.members.map((m) => m.name);
  const h = conv.huddle; const inThis = huddle.call && huddle.call.conversationId === conv.id;
  const isAdmin = me?.role === "ADMIN";
  const other = conv.kind === "dm" ? conv.members.find((m) => m.id !== me?.uid) : null;
  async function saveTopic() { await api("/api/chat/conversations", "PATCH", { id: conv.id, topic }); setEditTopic(false); reloadChat(); reload(); }

  return (
    <>
      <header className="sl-head">
        <button className="sl-icon back" aria-label="Back" onClick={onBack}><ArrowLeft size={18} /></button>
        <div className="sl-head-title">
          <b className="row" style={{ gap: 6, flexWrap: "nowrap" }}>{conv.kind === "dm" ? <Avatar name={conv.title} size={22} online={conv.online} /> : <ConvIcon c={conv} size={18} />}<span className="ellipsis">{conv.title}</span></b>
          {conv.kind === "channel" ? (editTopic
            ? <span className="row" style={{ gap: 6 }}><input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveTopic()} placeholder="What's this channel about?" style={{ padding: "3px 8px", maxWidth: 320 }} /><button className="ghost sm" onClick={saveTopic}>Save</button></span>
            : <button className="sl-topic" onClick={() => setEditTopic(true)}>{conv.topic || "Add a topic"}</button>)
            : <span className="sl-sub">{conv.kind === "dm" ? (other?.online ? "Active now" : "Away") + (other?.role === "ADMIN" ? " · Admin" : other?.agentId ? " · " + other.agentId : "") : conv.members.length + " members"}</span>}
        </div>
        <div className="sl-head-actions">
          {training && isAdmin && <button className="sl-huddle" onClick={() => setLessonEdit({})}><BookOpen size={16} /> New lesson</button>}
          {coach && isAdmin && <button className="sl-huddle" onClick={coachNow} disabled={coachBusy}><Sparkles size={16} /> {coachBusy ? "Reading notepads…" : "Coach everyone now"}</button>}
          {!training && !coach && conv.id !== UPSBOT && <AiButton task="summarize_chat" payload={{ conversationId: conv.id }} label="Catch me up" />}
          <button className="sl-members" onClick={onMembers} aria-label="Members">
            <span className="stack-av">{conv.members.slice(0, 3).map((m) => <Avatar key={m.id} name={m.name} size={22} />)}</span>{conv.members.length}
          </button>
          {inThis ? <button className="sl-huddle on" disabled><Headphones size={16} /> In huddle</button>
            : h ? <button className="sl-huddle live" onClick={() => huddle.join(h.id).then(reloadChat)}><Headphones size={16} /> Join huddle · {h.count}</button>
            : isAdmin ? <button className="sl-huddle" onClick={() => huddle.start(conv.id).then(reloadChat)}><Headphones size={16} /> {conv.kind === "dm" ? "Call" : "Huddle"}</button> : null}
        </div>
      </header>

      <div className="sl-msgs">
        {msgs === null ? <p className="sl-empty">Loading…</p> : (
          <>
            <div className="sl-intro">
              {conv.kind === "dm" ? <Avatar name={conv.title} size={64} /> : <span className="sl-intro-ico"><ConvIcon c={conv} size={30} /></span>}
              <h2>{conv.kind === "channel" ? "#" + conv.title : conv.title}</h2>
              <p className="muted">{conv.id === UPSBOT ? "Only admins can see this. Send a tracking number with the order number or customer name (e.g. 1Z999AA10123456784 #12345) and the Modo bot adds it to the sale and checks UPS. Type help for everything it can do." : coach ? "Only admins can see this. Whenever an agent's notepad changes, the Modo bot posts a summary here with what to say to each customer and how to engage them." : training ? "Lessons and call guides from management. Read each one, tap Got it, and ask questions in the lesson's thread." : conv.kind === "channel" ? `This is the start of #${conv.title}. ${conv.topic || ""}` : conv.kind === "dm" ? `This is your conversation with ${conv.title}.` : `Group with ${names.join(", ")}.`}</p>
            </div>
            <MessageList msgs={msgs} me={me} names={names} onThread={onThread} reload={reload} activeThread={thread} conv={conv} onEditLesson={setLessonEdit} />
          </>
        )}
        <div ref={bottom} />
      </div>
      {coachErr && <div className="err small" style={{ margin: "0 20px 6px" }}>{coachErr}</div>}
      {training && !isAdmin
        ? <div className="sl-composer-wrap"><div className="tr-readonly"><GraduationCap size={16} /> Only admins post here. Have a question? Open a lesson's thread and ask.</div></div>
        : <Composer conv={conv} names={names} members={conv.members} me={me} onSent={reload}
            placeholder={conv.id === UPSBOT ? "Tracking number + order # or customer name (e.g. 1Z999AA10123456784 #12345) · help · list" : training ? "Post a short note to everyone (use New lesson for a full guide)" : `Message ${conv.kind === "channel" ? "#" + conv.title : conv.title}`} />}
      {lessonEdit && <LessonEditor lesson={lessonEdit} onClose={() => setLessonEdit(null)} onDone={() => { setLessonEdit(null); reload(); reloadChat(); }} />}
    </>
  );
}

function MessageList({ msgs, me, names, onThread, reload, activeThread, inThread, conv, onEditLesson }) {
  let lastDay = "", prev = null;
  return msgs.map((m, idx) => {
    const d = dayLabel(m.at); const newDay = d !== lastDay; if (newDay) lastDay = d;
    const grouped = !newDay && prev && prev.userId === m.userId && prev.kind !== "SYSTEM" && m.kind !== "SYSTEM" && new Date(m.at) - new Date(prev.at) < 5 * 60000 && !(inThread && idx === 1);
    prev = m;
    return (
      <Fragment key={m.id}>
        {newDay && <div className="sl-day"><span>{d}</span></div>}
        {m.kind === "SYSTEM" ? <div className="sl-sys">{m.text} <span>· {t(m.at)}</span></div>
          : m.kind === "COACH" ? <CoachPost m={m} />
          : m.kind === "LESSON" ? <Lesson m={m} me={me} conv={conv} onThread={onThread} reload={reload} inThread={inThread} active={activeThread === m.id} onEdit={onEditLesson} />
          : <Message m={m} me={me} names={names} grouped={grouped} onThread={onThread} reload={reload} active={activeThread === m.id} inThread={inThread} isParent={inThread && idx === 0} />}
      </Fragment>
    );
  });
}

function Message({ m, me, names, grouped, onThread, reload, active, inThread, isParent }) {
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text || "");
  const mine = m.userId === me?.uid; const canDelete = mine || me?.role === "ADMIN";
  const react = async (emoji) => { setPicker(false); await api("/api/chat/react", "POST", { messageId: m.id, emoji }); reload(); };
  const save = async () => { const r = await api(`/api/chat/messages/${m.id}`, "PATCH", { text }); if (r.ok) { setEditing(false); reload(); } };
  const del = async () => { if (confirm("Delete this message?")) { await api(`/api/chat/messages/${m.id}`, "DELETE"); reload(); } };
  const deleted = m.kind === "DELETED";

  return (
    <div className={"sl-msg" + (grouped ? " grouped" : "") + (active ? " active" : "") + (isParent ? " parent" : "")}>
      <div className="sl-gutter">{grouped ? <span className="sl-hover-time">{t(m.at)}</span> : <Avatar name={m.by} size={36} />}</div>
      <div className="sl-body">
        {!grouped && <div className="sl-meta"><b>{m.by}</b>{m.role === "ADMIN" && <span className="sl-tag">Admin</span>}<span>{t(m.at)}</span></div>}
        {deleted ? <div className="sl-deleted">This message was deleted.</div> : editing ? (
          <div className="sl-edit">
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") setEditing(false); }} autoFocus />
            <div className="row" style={{ gap: 6 }}><button className="ghost sm" onClick={() => setEditing(false)}>Cancel</button><button className="sm" onClick={save}>Save</button></div>
          </div>
        ) : (
          <>
            {m.text && <div className="sl-text"><RichText text={m.text} names={names} meName={me?.name} />{m.editedAt && <span className="sl-edited"> (edited)</span>}</div>}
            {m.kind === "AUDIO" && <div className="sl-voice"><Mic size={14} /><audio controls preload="metadata" src={"/api/chat/file/" + m.file.id} /><a className="ghost sm icon-btn" href={"/api/chat/file/" + m.file.id + "?download=1"} title="Download voice note" aria-label="Download voice note"><Download size={14} /></a></div>}
            {m.kind === "FILE" && (m.file.mime?.startsWith("image/")
              ? <a href={"/api/chat/file/" + m.file.id} target="_blank" rel="noreferrer"><img className="sl-img" src={"/api/chat/file/" + m.file.id} alt={m.file.name} /></a>
              : <a className="sl-file" href={"/api/chat/file/" + m.file.id + "?download=1"}><FileText size={26} /><span><b className="ellipsis" style={{ display: "block" }}>{m.file.name}</b><span className="muted small">{kb(m.file.size)}</span></span><Download size={16} /></a>)}
          </>
        )}
        {m.reactions?.length > 0 && (
          <div className="sl-reacts">
            {m.reactions.map((r) => <button key={r.emoji} className={"sl-react" + (r.mine ? " mine" : "")} title={r.who.join(", ")} onClick={() => react(r.emoji)}>{r.emoji} <b>{r.count}</b></button>)}
            <button className="sl-react add" aria-label="Add reaction" onClick={() => setPicker((p) => !p)}><Smile size={14} /></button>
          </div>
        )}
        {!inThread && m.replies && <button className="sl-replies" onClick={() => onThread(m.id)}><MessageSquareReply size={14} /> {m.replies.count} {m.replies.count === 1 ? "reply" : "replies"} <span>Last reply {ago(m.replies.lastAt)}</span></button>}
        {picker && <div className="sl-picker">{EMOJIS.map((e) => <button key={e} onClick={() => react(e)}>{e}</button>)}</div>}
      </div>
      {!deleted && !editing && (
        <div className="sl-actions" role="toolbar" aria-label="Message actions">
          {EMOJIS.slice(0, 3).map((e) => <button key={e} onClick={() => react(e)} aria-label={"React " + e}>{e}</button>)}
          <button onClick={() => setPicker((p) => !p)} aria-label="More reactions" title="Add reaction"><Smile size={16} /></button>
          {!inThread && <button onClick={() => onThread(m.id)} aria-label="Reply in thread" title="Reply in thread"><MessageSquareReply size={16} /></button>}
          {mine && m.text && <button onClick={() => { setText(m.text); setEditing(true); }} aria-label="Edit" title="Edit"><Pencil size={15} /></button>}
          {canDelete && <button onClick={del} aria-label="Delete" title="Delete"><Trash2 size={15} /></button>}
        </div>
      )}
    </div>
  );
}

function Composer({ conv, names, members, me, onSent, placeholder, parentId }) {
  const [text, setText] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [emoji, setEmoji] = useState(false); const [mention, setMention] = useState(null);
  const [rec, setRec] = useState(false); const [secs, setSecs] = useState(0);
  const fileRef = useRef(null); const box = useRef(null); const recRef = useRef(null);

  async function send(extra) {
    setErr(""); setBusy(true);
    const f = new FormData(); f.set("c", conv.id); if (parentId) f.set("parentId", parentId);
    if (extra?.file) { f.set("file", extra.file, extra.name || extra.file.name); if (extra.voice) f.set("voice", "1"); if (text.trim()) f.set("text", text); }
    else f.set("text", text);
    const r = await fetch("/api/chat/messages", { method: "POST", body: f }); const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't send.");
    setText(""); onSent();
  }
  const pickFile = (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (file.size > MAX) return setErr("Files can be up to 4 MB."); send({ file }); };
  const onChange = (e) => {
    const v = e.target.value; setText(v);
    const m = v.slice(0, e.target.selectionStart).match(/@([\w ]{0,20})$/);
    setMention(m ? m[1].toLowerCase() : null);
  };
  const insertMention = (name) => { setText((v) => v.replace(/@([\w ]{0,20})$/, "@" + name + " ")); setMention(null); box.current?.focus(); };
  const insert = (s) => { setText((v) => v + s); setEmoji(false); box.current?.focus(); };
  const suggestions = mention == null ? [] : [...members.filter((m) => m.id !== me?.uid).map((m) => m.name), "channel", "here"].filter((n) => n.toLowerCase().startsWith(mention)).slice(0, 6);

  async function startRec() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((x) => window.MediaRecorder?.isTypeSupported?.(x)) || "";
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined); const chunks = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((x) => x.stop()); clearInterval(recRef.current.timer); setRec(false);
        if (recRef.current.cancel) return;
        const mime = mr.mimeType || "audio/webm"; const blob = new Blob(chunks, { type: mime });
        if (blob.size > MAX) return setErr("Voice note too long (max about 4 minutes).");
        send({ file: blob, name: "voice-note." + (mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm"), voice: true });
      };
      mr.start(); setSecs(0); setRec(true);
      recRef.current = { mr, cancel: false, timer: setInterval(() => setSecs((s) => { if (s >= 239) mr.stop(); return s + 1; }), 1000) };
    } catch { setErr("Microphone is blocked. Allow it in the browser address bar."); }
  }
  const stopRec = (cancel) => { if (recRef.current) { recRef.current.cancel = cancel; recRef.current.mr.stop(); } };

  return (
    <div className="sl-composer-wrap">
      {err && <div className="err small" style={{ marginBottom: 6 }}>{err}</div>}
      <div className="sl-composer">
        {suggestions.length > 0 && (
          <div className="sl-mentions">{suggestions.map((n) => <button key={n} onMouseDown={(e) => { e.preventDefault(); insertMention(n); }}><Avatar name={n} size={20} /> {n}</button>)}</div>
        )}
        {rec ? (
          <div className="sl-rec"><span className="live-dot" /> Recording voice note {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            <span style={{ marginLeft: "auto" }} className="row"><button className="ghost sm" onClick={() => stopRec(true)}>Cancel</button><button className="sm" onClick={() => stopRec(false)}><Send size={14} /> Send</button></span>
          </div>
        ) : (
          <textarea ref={box} rows={1} value={text} placeholder={placeholder} onChange={onChange} disabled={busy}
            onKeyDown={(e) => {
              if (suggestions.length && (e.key === "Tab" || e.key === "Enter")) { e.preventDefault(); insertMention(suggestions[0]); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim() && !busy) send(); }
            }} />
        )}
        <div className="sl-tools">
          <input ref={fileRef} type="file" hidden onChange={pickFile} />
          <button aria-label="Attach a file" title="Attach a file" onClick={() => fileRef.current.click()} disabled={busy || rec}><Paperclip size={17} /></button>
          <button aria-label="Emoji" title="Emoji" onClick={() => setEmoji((x) => !x)} disabled={rec}><Smile size={17} /></button>
          <button aria-label="Mention someone" title="Mention someone" onClick={() => { setText((v) => v + (v && !v.endsWith(" ") ? " @" : "@")); setMention(""); box.current?.focus(); }} disabled={rec}><AtSign size={17} /></button>
          <button aria-label="Record a voice note" title="Record a voice note" onClick={startRec} disabled={busy || rec}><Mic size={17} /></button>
          <button className={"sl-send" + (text.trim() ? " ready" : "")} aria-label="Send" onClick={() => text.trim() && send()} disabled={busy || rec || !text.trim()}><Send size={16} /></button>
          {emoji && <div className="sl-picker up">{["😀", "😂", "😊", "😍", "🤝", ...EMOJIS].map((e) => <button key={e} onClick={() => insert(e)}>{e}</button>)}</div>}
        </div>
      </div>
      <div className="sl-hint">Enter to send · Shift+Enter for a new line · @ to mention</div>
    </div>
  );
}

function Thread({ conv, me, parentId, onClose }) {
  const [msgs, reload] = useMessages(conv.id, parentId);
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs?.length]);
  const names = conv.members.map((m) => m.name);
  return (
    <aside className="sl-thread">
      <header className="sl-head"><div className="sl-head-title"><b>Thread</b><span className="sl-sub">{conv.kind === "channel" ? "#" + conv.title : conv.title}</span></div>
        <button className="sl-icon" aria-label="Close thread" onClick={onClose} style={{ marginLeft: "auto" }}><X size={18} /></button></header>
      <div className="sl-msgs">
        {msgs === null ? <p className="sl-empty">Loading…</p> : (
          <>
            <MessageList msgs={msgs.slice(0, 1)} me={me} names={names} reload={reload} inThread conv={conv} />
            {msgs.length > 1 && <div className="sl-divider"><span>{msgs.length - 1} {msgs.length === 2 ? "reply" : "replies"}</span></div>}
            <MessageList msgs={msgs.slice(1)} me={me} names={names} reload={reload} inThread />
          </>
        )}
        <div ref={bottom} />
      </div>
      <Composer conv={conv} names={names} members={conv.members} me={me} onSent={reload} parentId={parentId} placeholder={conv.id === TRAINING ? "Ask a question about this lesson…" : "Reply…"} />
    </aside>
  );
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="sl-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"sl-modal panel" + (wide ? " wide" : "")} role="dialog" aria-label={title}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>{title}</h2><button className="sl-icon" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function PeoplePicker({ picked, setPicked, exclude = [] }) {
  const [people, setPeople] = useState([]); const [q, setQ] = useState("");
  useEffect(() => { api("/api/chat/people").then((r) => r.ok && setPeople(r.data)); }, []);
  const shown = people.filter((p) => !exclude.includes(p.id) && (p.name + " " + (p.agentId || "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="sl-people">
        {shown.map((p) => (
          <label key={p.id} className={"sl-person" + (picked.includes(p.id) ? " on" : "")}>
            <input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked((x) => (x.includes(p.id) ? x.filter((i) => i !== p.id) : [...x, p.id]))} />
            <Avatar name={p.name} size={28} online={p.online} /><span>{p.name}</span><span className="muted small" style={{ marginLeft: "auto" }}>{p.role === "ADMIN" ? "Admin" : p.agentId}</span>
          </label>
        ))}
        {!shown.length && <p className="muted small">No one found.</p>}
      </div>
    </>
  );
}

function CreateChannel({ onClose, onDone }) {
  const [name, setName] = useState(""); const [topic, setTopic] = useState(""); const [priv, setPriv] = useState(false); const [picked, setPicked] = useState([]); const [err, setErr] = useState("");
  const slug = name.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-_ ]/g, "").replace(/\s+/g, "-");
  async function create() { const r = await api("/api/chat/conversations", "POST", { channel: true, name, topic, isPrivate: priv, userIds: picked }); if (!r.ok) return setErr(r.data.error); onDone(r.data.id); }
  return (
    <Modal title="Create a channel" onClose={onClose}>
      <label>Name<div className="sl-prefix"><Hash size={15} /><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. sales-floor" /></div></label>
      {slug && slug !== name && <p className="muted small" style={{ margin: 0 }}>Will be created as #{slug}</p>}
      <label>Topic (optional)<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this channel about?" /></label>
      <label className="row" style={{ color: "var(--foreground)", fontWeight: 500 }}><input type="checkbox" style={{ width: "auto" }} checked={priv} onChange={(e) => setPriv(e.target.checked)} /> <Lock size={14} /> Private: only people you add can see it</label>
      <b className="small">Add people {priv ? "" : "(optional, anyone can join later)"}</b>
      <PeoplePicker picked={picked} setPicked={setPicked} />
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="ghost" onClick={onClose}>Cancel</button><button onClick={create} disabled={!slug}>Create</button></div>
    </Modal>
  );
}

function BrowseChannels({ onClose, onOpen }) {
  const [list, setList] = useState(null); const [q, setQ] = useState("");
  const load = () => api("/api/chat/channels").then((r) => r.ok && setList(r.data));
  useEffect(() => { load(); }, []);
  const act = async (c, action) => { await api("/api/chat/channels", "POST", { id: c.id, action }); if (action === "join") onOpen(c.id); else load(); };
  const shown = (list || []).filter((c) => (c.name + " " + (c.topic || "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Browse channels" onClose={onClose} wide>
      <input autoFocus placeholder="Search channels" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="sl-people">
        {list === null ? <p className="muted">Loading…</p> : shown.map((c) => (
          <div key={c.id} className="sl-person">
            <Hash size={16} /><span style={{ minWidth: 0 }}><b>{c.name}</b><span className="muted small" style={{ display: "block" }}>{c.count} members{c.topic ? " · " + c.topic : ""}</span></span>
            <span style={{ marginLeft: "auto" }}>{c.joined
              ? <span className="row" style={{ gap: 6 }}><button className="ghost sm" onClick={() => onOpen(c.id)}>Open</button>{c.id !== "everyone" && <button className="ghost sm" onClick={() => act(c, "leave")}>Leave</button>}</span>
              : <button className="sm" onClick={() => act(c, "join")}>Join</button>}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function NewMessage({ onClose, onDone }) {
  const [picked, setPicked] = useState([]); const [name, setName] = useState(""); const [err, setErr] = useState("");
  async function go() { const r = await api("/api/chat/conversations", "POST", { userIds: picked, name: picked.length > 1 ? name : undefined }); if (!r.ok) return setErr(r.data.error); onDone(r.data.id); }
  return (
    <Modal title="New message" onClose={onClose}>
      <PeoplePicker picked={picked} setPicked={setPicked} />
      {picked.length > 1 && <label>Group name (optional)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night shift" /></label>}
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="ghost" onClick={onClose}>Cancel</button><button onClick={go} disabled={!picked.length}>{picked.length > 1 ? "Start group" : "Open chat"}</button></div>
    </Modal>
  );
}

function Members({ conv, me, onClose, onChanged, onLeft }) {
  const [adding, setAdding] = useState(false); const [picked, setPicked] = useState([]);
  const add = async () => { await api("/api/chat/conversations", "PATCH", { id: conv.id, addUserIds: picked }); setAdding(false); setPicked([]); onChanged(); };
  const leave = async () => { await api("/api/chat/channels", "POST", { id: conv.id, action: "leave" }); onLeft(); };
  return (
    <Modal title={`${conv.kind === "channel" ? "#" + conv.title : conv.title} · ${conv.members.length} members`} onClose={onClose}>
      {adding ? (
        <>
          <PeoplePicker picked={picked} setPicked={setPicked} exclude={conv.members.map((m) => m.id)} />
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="ghost" onClick={() => setAdding(false)}>Back</button><button onClick={add} disabled={!picked.length}>Add {picked.length || ""}</button></div>
        </>
      ) : (
        <>
          <div className="sl-people">
            {conv.members.map((m) => (
              <div key={m.id} className="sl-person"><Avatar name={m.name} size={28} online={m.online} /><span>{m.name}{m.id === me?.uid ? " (you)" : ""}</span><span className="muted small" style={{ marginLeft: "auto" }}>{m.online ? "Active" : "Away"} · {m.role === "ADMIN" ? "Admin" : m.agentId}</span></div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            {conv.kind === "channel" && conv.id !== "everyone" && conv.id !== TRAINING ? <button className="ghost" onClick={leave}><Leave size={15} /> Leave channel</button> : <span />}
            {conv.kind !== "dm" && <button onClick={() => setAdding(true)}><Plus size={15} /> Add people</button>}
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------- #modo-training lessons ----------
// Body format: "# Heading", "\"Line to say\"", "- bullet", "[ ] checklist item", "! important", plain paragraph.
export const parseLesson = (text) => { try { const l = JSON.parse(text || "{}"); return { title: l.title || "Lesson", body: l.body || "", kind: l.kind === "knowledge" ? "knowledge" : "lesson", provider: l.provider || "" }; } catch { return { title: "Lesson", body: String(text || ""), kind: "lesson", provider: "" }; } };

export function LessonBody({ body, checks, onCheck }) {
  const out = []; let list = null, ci = 0;
  const flush = () => { if (list) { out.push(<ul key={"u" + out.length} className="tr-ul">{list}</ul>); list = null; } };
  body.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { flush(); return; }
    if (line.startsWith("- ")) { (list ||= []).push(<li key={i}>{line.slice(2)}</li>); return; }
    flush();
    if (line.startsWith("# ")) out.push(<h4 key={i} className="tr-h">{line.slice(2)}</h4>);
    else if (line.startsWith("! ")) out.push(<div key={i} className="tr-warn"><AlertTriangle size={15} /><span>{line.slice(2)}</span></div>);
    else if (/^\[( |x)\]\s/i.test(line)) { const k = ci++; const on = !!checks?.[k];
      out.push(<div key={i} role="checkbox" tabIndex={0} aria-checked={on} className={"tr-check" + (on ? " on" : "")} onClick={() => onCheck?.(k)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), onCheck?.(k))}>{on ? <CheckCircle2 size={16} /> : <Circle size={16} />}<span>{line.replace(/^\[( |x)\]\s/i, "")}</span></div>); }
    else if (/^["“].*["”]$/.test(line)) out.push(<blockquote key={i} className="tr-say">{line.replace(/^["“]|["”]$/g, "")}</blockquote>);
    else out.push(<p key={i} className="tr-p">{line}</p>);
  });
  flush();
  return out;
}

function Lesson({ m, me, conv, onThread, reload, inThread, active, onEdit }) {
  const l = parseLesson(m.text);
  const isAdmin = me?.role === "ADMIN";
  const [open, setOpen] = useState(l.kind !== "knowledge" || !!inThread);
  const [showWho, setShowWho] = useState(false);
  // Personal checklist ticks stay on this device only (a self-check while practising).
  const ck = "modo-lesson-" + m.id;
  const [checks, setChecks] = useState({});
  useEffect(() => { try { setChecks(JSON.parse(localStorage.getItem(ck) || "{}")); } catch {} }, [ck]);
  const tick = (k) => setChecks((c) => { const n = { ...c, [k]: !c[k] }; try { localStorage.setItem(ck, JSON.stringify(n)); } catch {} return n; });
  const got = m.reactions?.find((r) => r.emoji === GOT_IT);
  const mine = !!got?.mine;
  const readers = got?.who || [];
  const agents = (conv?.members || []).filter((x) => x.role !== "ADMIN" && x.id !== m.userId);
  const pending = agents.filter((x) => !readers.includes(x.name));
  const toggle = async () => { await api("/api/chat/react", "POST", { messageId: m.id, emoji: GOT_IT }); reload(); };
  const del = async () => { if (confirm("Delete this lesson for everyone?")) { await api(`/api/chat/messages/${m.id}`, "DELETE"); reload(); } };
  return (
    <article className={"tr-card" + (active ? " active" : "")}>
      <header className="tr-top">
        {l.kind === "knowledge" ? <span className="tr-badge kb"><BookOpen size={14} /> Product knowledge{l.provider ? " · " + l.provider : ""}</span> : <span className="tr-badge"><GraduationCap size={14} /> Lesson</span>}
        <span className="muted small">{m.by && m.by !== "Modo bot 🤖" ? m.by + " · " : ""}{dayLabel(m.at)}{m.editedAt ? " · edited" : ""}</span>
        {isAdmin && !inThread && <span className="tr-admin">
          <button className="sl-icon" title="Edit lesson" aria-label="Edit lesson" onClick={() => onEdit?.(m)}><Pencil size={15} /></button>
          <button className="sl-icon" title="Delete lesson" aria-label="Delete lesson" onClick={del}><Trash2 size={15} /></button>
        </span>}
      </header>
      <h3 className="tr-title">{l.title}</h3>
      {open ? <div className="tr-body"><LessonBody body={l.body} checks={checks} onCheck={tick} /></div>
        : <button className="tr-more" onClick={() => setOpen(true)}>Show lesson</button>}
      <footer className="tr-foot">
        <button className={"tr-got" + (mine ? " on" : "")} onClick={toggle}>{mine ? <CheckCircle2 size={16} /> : <Circle size={16} />}{mine ? "Got it" : "Mark as read"}</button>
        {!inThread && <button className="ghost sm" onClick={() => onThread?.(m.id)}><MessageSquareReply size={14} /> {m.replies ? `${m.replies.count} ${m.replies.count === 1 ? "question" : "questions"}` : "Ask a question"}</button>}
        {open && <button className="ghost sm" onClick={() => setOpen(false)}>Collapse</button>}
        {isAdmin && <span role="button" tabIndex={0} className="tr-stat" onClick={() => setShowWho((x) => !x)} onKeyDown={(e) => e.key === "Enter" && setShowWho((x) => !x)} title="Who has read it">{readers.length} of {agents.length || readers.length} read</span>}
      </footer>
      {isAdmin && showWho && (
        <div className="tr-who">
          <div><b className="small">Read</b><p className="small muted">{readers.length ? readers.join(", ") : "No one yet"}</p></div>
          <div><b className="small">Not yet</b><p className="small muted">{pending.length ? pending.map((x) => x.name).join(", ") : "Everyone has read it"}</p></div>
        </div>
      )}
    </article>
  );
}

export function LessonEditor({ lesson, onClose, onDone }) {
  const editing = !!lesson?.id;
  const start = editing ? parseLesson(lesson.text) : { title: "", body: "", kind: lesson?.kind || "lesson", provider: lesson?.provider || "" };
  const [title, setTitle] = useState(start.title); const [body, setBody] = useState(start.body);
  const [kind, setKind] = useState(start.kind); const [provider, setProvider] = useState(start.provider);
  const [tab, setTab] = useState("write"); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function save() {
    setErr(""); setBusy(true);
    let r;
    const data = { title, body, kind, provider: kind === "knowledge" ? provider : undefined };
    if (editing) r = await api(`/api/chat/messages/${lesson.id}`, "PATCH", { lesson: data });
    else { const f = new FormData(); f.set("c", TRAINING); f.set("lesson", JSON.stringify(data));
      const x = await fetch("/api/chat/messages", { method: "POST", body: f }); r = { ok: x.ok, data: await x.json().catch(() => ({})) }; }
    setBusy(false);
    if (!r.ok) return setErr(r.data.error || "Couldn't save.");
    onDone();
  }
  return (
    <Modal title={editing ? "Edit " + (kind === "knowledge" ? "product knowledge" : "lesson") : kind === "knowledge" ? "New product knowledge" : "New lesson"} onClose={onClose} wide>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 160px" }}>Type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="lesson">Lesson (how to do the job)</option><option value="knowledge">Product knowledge (facts about a provider)</option></select></label>
        {kind === "knowledge" && <label style={{ flex: "1 1 160px" }}>Provider<input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Verizon, AT&T, Xfinity" list="tr-providers" />
          <datalist id="tr-providers">{["Verizon", "AT&T", "T-Mobile", "Xfinity", "Spectrum", "Cox", "Other providers", "Glossary"].map((p) => <option key={p} value={p} />)}</datalist></label>}
      </div>
      <label>Title<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Handling the 'I'm happy with my provider' objection" /></label>
      <div className="row" style={{ gap: 6 }}>
        <button className={tab === "write" ? "sm" : "ghost sm"} onClick={() => setTab("write")}>Write</button>
        <button className={tab === "preview" ? "sm" : "ghost sm"} onClick={() => setTab("preview")} disabled={!body.trim()}>Preview</button>
      </div>
      {tab === "write" ? (
        <>
          <textarea className="tr-editor" value={body} onChange={(e) => setBody(e.target.value)} rows={14}
            placeholder={'Paste your guide or notes. Optional formatting:\n# Section heading\n"A line the agent says to the customer"\n- bullet point\n[ ] checklist item\n! important warning'} />
          <p className="muted small" style={{ margin: 0 }}><b># </b>heading · <b>"quotes"</b> line to say · <b>- </b>bullet · <b>[ ] </b>checklist · <b>! </b>warning. Modo AI also learns every lesson.</p>
        </>
      ) : <div className="tr-card tr-preview"><h3 className="tr-title">{title || "Untitled lesson"}</h3><div className="tr-body"><LessonBody body={body} /></div></div>}
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="ghost" onClick={onClose}>Cancel</button><button onClick={save} disabled={busy || !title.trim() || !body.trim()}>{busy ? "Saving…" : editing ? "Save changes" : "Post to everyone"}</button></div>
    </Modal>
  );
}

// #notepad-coach post from the Modo bot
function CoachPost({ m }) {
  let d = {}; try { d = JSON.parse(m.text || "{}"); } catch {}
  return (
    <article className="tr-card coach-post">
      <header className="tr-top">
        <span className="tr-badge"><Brain size={14} /> Notepad coach</span>
        <span className="muted small">{d.all ? "All notepads" + (d.by ? " · asked by " + d.by : "") : (d.agent || "Agent") + "'s notepad"} · {t(m.at)}</span>
      </header>
      {d.pending ? <p className="muted small" style={{ margin: 0 }}>Reading {d.agent ? d.agent + "'s" : "the"} notepad…</p> : <CoachResult res={d.result} hideAgentNames={!d.all} />}
    </article>
  );
}
