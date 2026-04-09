"use client";
import { useAgents, useRemoteAgents } from "@/lib/api-client";
import { SummaryBar } from "@/components/kitchen/summary-bar";
import { AgentGrid } from "@/components/kitchen/agent-grid";
import type { Agent } from "@/types";

export default function KitchenFloor() {
  const { data: localData, isLoading: localLoading } = useAgents();
  const { data: remoteData, isLoading: remoteLoading } = useRemoteAgents();

  const localAgents: Agent[] = localData?.agents || [];

  // Convert remote agents to Agent shape for unified display
  const remoteAgents: Agent[] = (remoteData?.agents || []).map((r) => ({
    id: `remote-${r.id}`,
    name: r.name,
    role: r.role,
    platform: r.platform as Agent["platform"],
    status: r.status === "active" ? "active" : "dormant",
    lastHeartbeat: r.status === "active" ? new Date().toISOString() : null,
    currentTask: r.healthData
      ? `${r.location} · ${r.latencyMs}ms`
      : null,
    lessonsCount: 0,
    todayMemoryCount: 0,
    location: r.location as Agent["location"],
    isRemote: true,
    latencyMs: r.latencyMs,
  }));

  // Show local agents immediately, remote agents populate when ready
  const allAgents = [...localAgents, ...remoteAgents];
  const active = allAgents.filter((a) => a.status === "active").length;
  const errors = allAgents.filter((a) => a.status === "error").length;
  const tasks = allAgents.filter((a) => a.currentTask && !a.isRemote).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Kitchen Floor</h1>
        <p className="text-sm text-slate-400">Real-time agent status board</p>
      </div>
      <SummaryBar total={allAgents.length} active={active} tasks={tasks} errors={errors} />
      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <AgentGrid agents={allAgents} />
      )}
    </div>
  );
}
