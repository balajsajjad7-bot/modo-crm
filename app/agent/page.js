"use client";
import { useAgent } from "@/components/agent/AgentContext";
import { ShiftMeter, BreakBox } from "@/components/agent/sections";
import ShiftExtras from "@/components/agent/ShiftExtras";
export default function Page() {
  const { me, now, toggleBreak } = useAgent();
  return <div className="stack"><ShiftMeter me={me} now={now} /><BreakBox me={me} now={now} toggle={toggleBreak} /><ShiftExtras /></div>;
}
