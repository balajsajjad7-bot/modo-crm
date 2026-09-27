"use client";
import { useAgent } from "@/components/agent/AgentContext";
import { LiveAssist } from "@/components/agent/sections";
export default function Page() {
  const { me, reload } = useAgent();
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <LiveAssist lastCall={me.lastCall} onDone={reload} />
      <p className="muted small" style={{ margin: 0 }}>Keep this page open during a customer call. Switching pages ends listening.</p>
    </div>
  );
}
