// Modo's front door: the public landing page (plans, features, get started). Sign in lives at /login.
import Landing from "@/components/Landing";
export const metadata = { title: "Modo — the call-center CRM for 2026", description: "Dialer, live call monitoring, AI coaching, attendance, payroll, chat and WhatsApp in one place. Plans from free." };
export default function Home() { return <Landing />; }
