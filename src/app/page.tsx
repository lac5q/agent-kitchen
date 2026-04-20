"use client";
import { useAgents, useRemoteAgents } from "@/lib/api-client";
import { SummaryBar } from "@/components/kitchen/summary-bar";
import { AgentGrid } from "@/components/kitchen/agent-grid";
import { HiveFeed } from "@/components/kitchen/hive-feed";
import { AgentPeersPanel } from "@/components/kitchen/agent-peers-panel";
import { AuditLogPanel } from "@/components/kitchen/audit-log-panel";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { AgentCardsPanel } from "@/components/dispatch/agent-cards-panel";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
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

  // Separate into master agents, sub-agents, and standalone agents
  const hermesMaster = allAgents.filter((a) => a.platform === "hermes");
  const openclawMaster = allAgents.filter((a) => a.platform === "openclaw");
  const hermesSubAgents = allAgents.filter((a) => a.masterId === "hermes" && !a.isRemote);
  const openclawSubAgents = allAgents.filter((a) => a.masterId === "openclaw" && !a.isRemote);
  const standaloneAgents = allAgents.filter(
    (a) => !a.masterId && a.platform !== "hermes" && a.platform !== "openclaw" && !a.isRemote
  );

  const active = allAgents.filter((a) => a.status === "active").length;
  const errors = allAgents.filter((a) => a.status === "error").length;
  const tasks = allAgents.filter((a) => a.currentTask && !a.isRemote).length;

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center text-2xl font-bold text-amber-500">
          The Kitchen Floor
          <InfoTip text="Real-time status board for all agents in the system. Shows both local agents running on this machine and remote agents from connected instances. Data refreshes automatically via the agents API." />
        </h1>
        <p className="text-sm text-slate-400">Real-time agent status board</p>
      </div>
      <SummaryBar total={allAgents.length} active={active} tasks={tasks} errors={errors} />
      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <AgentGrid
          sections={[
            ...(remoteAgents.length > 0 ? [{ title: "🌐 Remote Agents", agents: remoteAgents }] : []),
            ...(hermesMaster.length > 0 || hermesSubAgents.length > 0
              ? [{
                  title: "🔮 Hermes",
                  agents: [...hermesMaster, ...hermesSubAgents].sort((a, b) =>
                    a.platform === "hermes" ? -1 : b.platform === "hermes" ? 1 : 0
                  ),
                }]
              : []),
            ...(openclawMaster.length > 0 || openclawSubAgents.length > 0
              ? [{
                  title: "🦷 OpenClaw",
                  agents: [...openclawMaster, ...openclawSubAgents].sort((a, b) =>
                    a.platform === "openclaw" ? -1 : b.platform === "openclaw" ? 1 : 0
                  ),
                }]
              : []),
            ...(standaloneAgents.length > 0 ? [{ title: "⚙️ Standalone Agents", agents: standaloneAgents }] : []),
          ]}
        />
      )}
      <HiveFeed />
      <AgentCardsPanel />
      <AgentPeersPanel />
      <AuditLogPanel />
      <VoicePanel />
    </div>
    </TooltipProvider>
  );
}
