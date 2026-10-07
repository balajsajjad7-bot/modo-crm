"use client";
import { useAgent } from "@/components/agent/AgentContext";
import { ShiftMeter, BreakBox } from "@/components/agent/sections";
import ShiftExtras from "@/components/agent/ShiftExtras";
import Launcher from "@/components/Launcher";
import MyPlan from "@/components/agent/MyPlan";
export default function Page() {
  const { me, now, toggleBreak } = useAgent();
  return <div className="stack"><ShiftMeter me={me} now={now} /><Launcher title="Go to" /><BreakBox me={me} now={now} toggle={toggleBreak} /><ShiftExtras /><MyPlan /></div>;
}
