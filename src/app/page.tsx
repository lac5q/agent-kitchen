"use client";
import { useAgents } from "@/lib/api-client";
import { SummaryBar } from "@/components/kitchen/summary-bar";
import { AgentGrid } from "@/components/kitchen/agent-grid";

export default function KitchenFloor() {
  const { data, isLoading } = useAgents();
  const agents = data?.agents || [];
  const active = agents.filter((a) => a.status === "active").length;
  const errors = agents.filter((a) => a.status === "error").length;
  const tasks = agents.filter((a) => a.currentTask).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Kitchen Floor</h1>
        <p className="text-sm text-slate-400">Real-time agent status board</p>
      </div>
      <SummaryBar total={agents.length} active={active} tasks={tasks} errors={errors} />
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <AgentGrid agents={agents} />
      )}
    </div>
  );
}
