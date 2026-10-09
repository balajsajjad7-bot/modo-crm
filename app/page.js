// Modo's front door: the public landing page (plans, features, get started). Sign in lives at /login.
import Landing from "@/components/Landing";
export const metadata = { title: "Modo — the all-in-one team CRM for 2026", description: "Calls, live monitoring, AI coaching, hiring, attendance, payroll, chat and WhatsApp in one place. Plans from free." };
export default function Home() { return <Landing />; }
