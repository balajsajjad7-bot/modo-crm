"use client";
import { useAgent } from "@/components/agent/AgentContext";
import SaleForm from "@/components/agent/SaleForm";
export default function Page() {
  const { reload } = useAgent();
  return <SaleForm onDone={reload} />;
}
