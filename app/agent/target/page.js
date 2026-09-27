"use client";
import { useAgent } from "@/components/agent/AgentContext";
import { TargetBox, Leaderboard } from "@/components/agent/sections";
export default function Page() {
  const { me } = useAgent();
  return <div className="stack"><TargetBox me={me} /><Leaderboard me={me} /></div>;
}
