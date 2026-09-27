"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { AgentProvider, useAgent } from "@/components/agent/AgentContext";
import { Timer, Coffee, Trophy, ClipboardPaste, Mic, MessageSquare, Sparkles, Calculator, Kanban, Contact, ListChecks, BarChart3, Briefcase, NotebookPen, SearchCheck, BadgeCheck, PiggyBank, PhoneCall } from "lucide-react";

function BreakButton({ onBreak, since, onClick }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!onBreak) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [onBreak]);
  const secs = since ? Math.max(0, Math.floor((now - new Date(since)) / 1000)) : 0;
  return (
    <button className={"break-btn" + (onBreak ? " on" : "")} onClick={onClick} aria-pressed={onBreak} title={onBreak ? "End break" : "Start break"}>
      <span className="cup"><Coffee size={16} /><i /><i /><i /></span>
      <span>{onBreak ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "Break"}</span>
    </button>
  );
}

function Frame({ children }) {
  const { me, toggleBreak, endShift } = useAgent();
  const onBreak = !!me?.breaks?.open;
  const [perms, setPerms] = useState(null);
  const [be, setBe] = useState(false); const [dialerOn, setDialerOn] = useState(true);
  useEffect(() => { const l = () => fetch("/api/me").then((r) => r.json()).then((d) => { setPerms(d.perms || {}); setBe(!!d.budgetEase); setDialerOn(d.dialerOn !== false); }).catch(() => {}); l(); const t = setInterval(l, 60000); return () => clearInterval(t); }, []);
  const P = perms || { crm: true, notepad: true };
  const i = (C) => <C size={17} />;
  const nav = [
    ...(dialerOn ? [{ href: "/agent/dialer", label: "Dialer", hint: "Make and manage calls (your dialer runs in the background)", icon: i(PhoneCall) }] : []),
    { href: "/agent/lookups", label: "Lookups", hint: "USA phone, ZIP, address and email checks", icon: i(SearchCheck) },
    { href: "/agent", exact: true, label: "My shift", hint: "Time, breaks and deductions", icon: i(Timer) },
    ...(P.notepad ? [{ href: "/agent/notepad", label: "Notepad", hint: "Last notes and callbacks", icon: i(NotebookPen) }] : []),
    { label: "CRM", icon: i(Briefcase), children: [
      ...(P.crm ? [{ href: "/agent/pipeline", label: "My pipeline", hint: "Your deals by stage", icon: i(Kanban) },
      { href: "/agent/contacts", label: "My customers", hint: "People you're working with", icon: i(Contact) },
      { href: "/agent/tasks", label: "Tasks & callbacks", hint: "Your callbacks and to-dos", icon: i(ListChecks) }] : []),
      { href: "/agent/target", label: "Target & leaderboard", hint: "Today's target and ranking", icon: i(Trophy) },
      { href: "/agent/quality", label: "My call quality", hint: "AI coaching on every call", icon: i(BadgeCheck) },
      { href: "/agent/reports", label: "My stats", hint: "Your sales and attendance trends", icon: i(BarChart3) },
    ] },
    { href: "/agent/calculator", label: "Calculator", hint: "Quote a customer's discount", icon: i(Calculator) },
    be ? { href: "/agent/budgetease", label: "Budget Ease", hint: "Submit a utility-bill discount signup", icon: i(PiggyBank) }
       : { href: "/agent/sale", label: "Submit sale", hint: "Goes straight to admin", icon: i(ClipboardPaste) },
    { href: "/agent/call", label: "Call assist", hint: "Live suggestions while you talk", icon: i(Mic) },
    { href: "/agent/chat", label: "Chat", hint: "Channels, messages, voice notes and huddles", icon: i(MessageSquare), chat: true },
    { href: "/agent/ai", label: "Modo AI", hint: "Scripts, objections and quick help", icon: i(Sparkles) },
  ];
  return (
    <Shell nav={nav} home="/agent" navAction={<BreakButton onBreak={onBreak} since={me?.breaks?.open?.start} onClick={toggleBreak} />} header={onBreak ? "On break" : ""} status={onBreak ? "warn" : ""} userSub={me ? `${me.agentId} · shift ${me.shiftStart}` : ""}
      userMenu={[{ label: onBreak ? "End break" : "Start break", icon: <Coffee size={16} />, onClick: toggleBreak }]} signOutLabel="End shift" onSignOut={endShift}>
      {me ? children : <p className="muted">Loading your shift…</p>}
    </Shell>
  );
}

export default function AgentLayout({ children }) {
  return <AgentProvider><Frame>{children}</Frame></AgentProvider>;
}
