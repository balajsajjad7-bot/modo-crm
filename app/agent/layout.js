"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { AgentProvider, useAgent } from "@/components/agent/AgentContext";
import Onboarding from "@/components/agent/Onboarding";
import GeoReporter from "@/components/agent/GeoReporter";
import { Timer, Coffee, Trophy, ClipboardPaste, Mic, MessageSquare, Sparkles, Calculator, Kanban, Contact, ListChecks, BarChart3, Briefcase, NotebookPen, SearchCheck, BadgeCheck, PiggyBank, PhoneCall, Lock, FileText, GraduationCap, Wand2, Phone } from "lucide-react";

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
  const [be, setBe] = useState(false); const [dialerOn, setDialerOn] = useState(true); const [secure, setSecure] = useState(false);
  useEffect(() => { const l = () => fetch("/api/me").then((r) => r.json()).then((d) => { setPerms(d.perms || {}); setBe(!!d.budgetEase); setDialerOn(d.dialerOn !== false); setSecure(!!d.secureLine || !!d.ceo); }).catch(() => {}); l(); const t = setInterval(l, 60000); return () => clearInterval(t); }, []);
  const P = perms || { crm: true, notepad: true };
  const i = (C) => <C size={17} />;
  const crmKids = [
    ...(P.notepad ? [{ href: "/agent/notepad", label: "Notepad", hint: "Last notes and callbacks", icon: i(NotebookPen) }] : []),
    ...(P.crm ? [{ href: "/agent/pipeline", label: "My pipeline", hint: "Your deals by stage", icon: i(Kanban) },
      { href: "/agent/contacts", label: "My customers", hint: "People you're working with", icon: i(Contact) },
      { href: "/agent/tasks", label: "Tasks & callbacks", hint: "Your callbacks and to-dos", icon: i(ListChecks) }] : []),
  ];
  const progressKids = [
    { href: "/agent/target", label: "Target & leaderboard", hint: "Today's target and ranking", icon: i(Trophy) },
    { href: "/agent/quality", label: "My call quality", hint: "AI coaching on every call", icon: i(BadgeCheck) },
    { href: "/agent/reports", label: "My stats", hint: "Your sales and attendance trends", icon: i(BarChart3) },
    ...(P.lookups !== false ? [{ href: "/agent/lookups", label: "Lookups", hint: "USA phone, ZIP, address and email checks", icon: i(SearchCheck) }] : []),
    ...(P.calculator !== false ? [{ href: "/agent/calculator", label: "Calculator", hint: "Quote a customer's discount", icon: i(Calculator) }] : []),
    { href: "/agent/contract", label: "My contract", hint: "Your welcome and confidential contract", icon: i(FileText) },
  ];
  const callKids = [
    ...(dialerOn ? [{ href: "/agent/dialer", label: "Dialer", hint: "Make and manage calls (your dialer runs in the background)", icon: i(PhoneCall) }] : []),
    ...(P.googleVoice !== false ? [{ href: "/agent/phone", label: "Phone", hint: "Call anyone from Modo on your VICIdial lines (just allow the microphone)", icon: i(Phone) }] : []),
    ...(P.callAssist !== false ? [{ href: "/agent/call", label: "Call assist", hint: "Live suggestions while you talk", icon: i(Mic) }] : []),
  ];
  const aiKids = [
    ...(P.modoAI !== false ? [{ href: "/agent/ai", label: "Modo AI", hint: "Scripts, objections and quick help", icon: i(Sparkles) }] : []),
    ...(P.aiBuilder !== false ? [{ href: "/agent/builder", label: "AI Builder", hint: "Describe any app, tool or page and it builds it live", icon: i(Wand2) }] : []),
    { href: "/agent/guide", label: "Trainer", hint: "Every tool and how to use it", icon: i(GraduationCap) },
    { href: "/agent/whatsnew", label: "What's new", hint: "New features and changes in Modo", icon: i(Sparkles) },
  ];
  const chatItem = { href: "/agent/chat", label: "Chat", hint: "Channels, messages, voice notes and huddles", icon: i(MessageSquare), chat: true };
  const nav = [
    { href: "/agent", exact: true, label: "My shift", hint: "Time, breaks and deductions", icon: i(Timer) },
    ...(callKids.length === 1 ? callKids : callKids.length ? [{ label: "Calls", icon: i(PhoneCall), children: callKids }] : []),
    ...(P.submitSale !== false ? [be ? { href: "/agent/budgetease", label: "Budget Ease", hint: "Submit a utility-bill discount signup", icon: i(PiggyBank) }
       : { href: "/agent/sale", label: "Submit sale", hint: "Goes straight to admin", icon: i(ClipboardPaste) }] : []),
    ...(crmKids.length ? [{ label: "CRM", icon: i(Briefcase), children: crmKids }] : []),
    { label: "My progress", icon: i(Trophy), children: progressKids },
    ...(P.chat !== false ? [secure ? { label: "Chat", icon: i(MessageSquare), chat: true, children: [chatItem, { href: "/agent/vault", label: "Secure line", hint: "Encrypted room — invited by the CEO", icon: i(Lock) }] } : chatItem]
       : secure ? [{ href: "/agent/vault", label: "Secure line", hint: "Encrypted room — invited by the CEO", icon: i(Lock) }] : []),
    { label: "AI", icon: i(Sparkles), children: aiKids },
  ];
  return (
    <Shell nav={nav} home="/agent" navAction={<BreakButton onBreak={onBreak} since={me?.breaks?.open?.start} onClick={toggleBreak} />} header={onBreak ? "On break" : ""} status={onBreak ? "warn" : ""} userSub={me ? `${me.agentId} · shift ${me.shiftStart}` : ""}
      userMenu={[{ label: onBreak ? "End break" : "Start break", icon: <Coffee size={16} />, onClick: toggleBreak }]} signOutLabel="End shift" onSignOut={endShift}>
      {me ? children : <p className="muted">Loading your shift…</p>}
      <Onboarding />
      <GeoReporter />
    </Shell>
  );
}

export default function AgentLayout({ children }) {
  return <AgentProvider><Frame>{children}</Frame></AgentProvider>;
}
