"use client";
import Shell from "@/components/Shell";
import { LayoutDashboard, Receipt, Users, Wallet, Settings, MessageSquare, Sparkles, Calculator, Plug, Kanban, Contact, ListChecks, BarChart3, Fingerprint, MonitorSmartphone, Briefcase, Wrench, UsersRound, NotebookPen, Mail, ShieldCheck, UserCog, Building2, Coffee, SearchCheck, BadgeCheck, CalendarClock, PiggyBank, PhoneCall, Brain, Download, MonitorDown, Disc3, Lock, MapPin } from "lucide-react";
import { usePoll } from "@/components/admin/api";
import { useEffect, useState } from "react";

export default function AdminLayout({ children }) {
  const [{ data: sales }] = usePoll("/api/sales", 30000);
  const fresh = (sales || []).filter((s) => s.status === "NEW").length;
  const [secure, setSecure] = useState(false);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((m) => setSecure(!!m?.ceo || !!m?.secureLine)).catch(() => {}); }, []);
  const i = (C) => <C size={17} />;
  const nav = [
    { href: "/admin", exact: true, label: "Overview", hint: "Live floor, leaderboard and calls", icon: i(LayoutDashboard) },
    { label: "Sales", icon: i(Receipt), badge: fresh || null, children: [
      { href: "/admin/sales", label: "Sales", hint: "Sales submitted by agents", icon: i(Receipt), badge: fresh || null },
      { href: "/admin/budgetease", label: "Budget Ease", hint: "Utility-bill discount signups (separate from sales)", icon: i(PiggyBank) },
      { href: "/admin/reports", label: "Reports", hint: "Sales, pipeline, attendance trends", icon: i(BarChart3) },
    ] },
    { label: "CRM", icon: i(Briefcase), children: [
      { href: "/admin/pipeline", label: "Pipeline", hint: "Deals by stage, drag to move", icon: i(Kanban) },
      { href: "/admin/contacts", label: "Customers", hint: "Everyone you've talked to", icon: i(Contact) },
      { href: "/admin/notepad", label: "Notepad", hint: "Last notes and callbacks for every customer", icon: i(NotebookPen) },
      { href: "/admin/email", label: "Email", hint: "Email customers and see what was sent", icon: i(Mail) },
      { href: "/admin/tasks", label: "Tasks & callbacks", hint: "Who needs to call whom, when", icon: i(ListChecks) },
    ] },
    { label: "Calls", icon: i(PhoneCall), children: [
      { href: "/admin/quality", label: "Call quality (QA)", hint: "AI review of every call: grammar, nervousness, compliance", icon: i(BadgeCheck) },
      { href: "/admin/recordings", label: "Call recordings", hint: "Play & download your VICIdial recordings by day", icon: i(Disc3) },
      { href: "/admin/dialer", label: "Dialer setup", hint: "Connect VICIdial or another dialer, link agents, results & pause codes", icon: i(PhoneCall) },
    ] },
    { label: "Team", icon: i(UsersRound), children: [
      { href: "/admin/attendance", label: "Attendance", hint: "Who's in, office or remote, auto clock-in/out", icon: i(Fingerprint) },
      { href: "/admin/whereabouts", label: "Whereabouts", hint: "Live map of who's at the office; leave/return alerts", icon: i(MapPin) },
      { href: "/admin/agents", label: "Agents", hint: "Add, edit, call and manage agents", icon: i(Users) },
      { href: "/admin/shifts", label: "Shifts", hint: "Edit everyone's shift times; automatic clock-out at shift end", icon: i(CalendarClock) },
      { href: "/admin/breaks", label: "Break report", hint: "Every break, per agent per day", icon: i(Coffee) },
      { href: "/admin/payroll", label: "Payroll", hint: "Monthly pay, deductions and bonuses", icon: i(Wallet) },
      { href: "/admin/users", label: "Users & admins", hint: "Create admins, reset passwords and 2-step", icon: i(UserCog) },
      { href: "/admin/org", label: "Departments & campaigns", hint: "Outreach, Customer Happiness… Budget Ease, Verizon, AT&T", icon: i(Building2) },
      { href: "/admin/access", label: "Agent access", hint: "Choose what agents can see and change", icon: i(ShieldCheck) },
      { href: "/kiosk", label: "Office kiosk", hint: "Check-in screen for the office entrance", icon: i(MonitorSmartphone) },
    ] },
    { href: "/admin/chat", label: "Chat", hint: "Channels, messages, voice notes and huddles", icon: i(MessageSquare), chat: true },
    ...(secure ? [{ href: "/admin/vault", label: "Secure line", hint: "Encrypted room", icon: i(Lock) }] : []),
    { href: "/admin/ai", label: "Modo AI", hint: "Ask anything about your team, sales and pay", icon: i(Sparkles) },
    { label: "Setup", icon: i(Wrench), children: [
      { href: "/admin/lookups", label: "Lookups", hint: "USA phone, ZIP, address, email and your own lookup APIs", icon: i(SearchCheck) },
      { href: "/admin/calculator", label: "Discount calculator", hint: "Quotes and discount rules", icon: i(Calculator) },
      { href: "/admin/train", label: "Train Modo AI", hint: "Teach the AI your prices, script, rules and objections", icon: i(Brain) },
      { href: "/admin/connectors", label: "Connectors", hint: "Slack, Discord, Sheets, webhooks, AI, VICIdial", icon: i(Plug) },
      { href: "/admin/settings", label: "Settings", hint: "IP lock, breaks, idle and targets", icon: i(Settings) },
      { href: "/admin/app", label: "Windows app", hint: "Download the installer and lock down PCs", icon: i(MonitorDown) },
      { href: "/install", label: "Install on phones", hint: "Add Modo to Android & iPhone (QR + steps)", icon: i(MonitorSmartphone) },
      { href: "/admin/updates", label: "Updates", hint: "Modo version and what's new", icon: i(Download) },
    ] },
  ];
  const signOut = async (leaveCall) => { await leaveCall(); await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; };
  return <Shell nav={nav} home="/admin" onSignOut={signOut}>{children}</Shell>;
}
