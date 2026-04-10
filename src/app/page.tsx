"use client";
import { useAgents, useRemoteAgents, useDevToolsStatus } from "@/lib/api-client";
import { SummaryBar } from "@/components/kitchen/summary-bar";
import { AgentGrid } from "@/components/kitchen/agent-grid";
import type { Agent } from "@/types";

const DEV_TOOL_DEFS: { id: string; name: string; icon: string; platform: Agent["platform"] }[] = [
  { id: "claude-code", name: "Claude Code", icon: "🔷", platform: "claude" },
  { id: "qwen-cli",    name: "Qwen CLI",    icon: "🐉", platform: "qwen" },
  { id: "gemini-cli",  name: "Gemini CLI",  icon: "✨", platform: "gemini" },
  { id: "codex",       name: "Codex",       icon: "📝", platform: "codex" },
];

export default function KitchenFloor() {
  const { data: localData, isLoading: localLoading } = useAgents();
  const { data: remoteData } = useRemoteAgents();
  const { data: devToolsData } = useDevToolsStatus();

  const localAgents: Agent[] = localData?.agents || [];

  // Convert remote agents to Agent shape for unified display
  const remoteAgents: Agent[] = (remoteData?.agents || []).map((r) => ({
    id: `remote-${r.id}`,
    name: r.name,
    role: r.role,
    platform: r.platform as Agent["platform"],
    status: r.status === "active" ? "active" : "dormant",
    lastHeartbeat: r.status === "active" ? new Date().toISOString() : null,
    currentTask: r.healthData ? `${r.location} · ${r.latencyMs}ms` : null,
    lessonsCount: 0,
    todayMemoryCount: 0,
    location: r.location as Agent["location"],
    isRemote: true,
    latencyMs: r.latencyMs,
    agentKind: "agentic" as const,
  }));

  // Dev tools — sourced from live /api/devtools-status
  const devToolAgents: Agent[] = DEV_TOOL_DEFS.map(({ id, name, icon, platform }) => {
    const t = devToolsData?.tools?.find((x) => x.id === id);
    const overall = t?.overall ?? "not-wired";
    return {
      id: `devtool-${id}`,
      name,
      role: t ? `mem0: ${t.mem0} · qmd: ${t.qmd}` : "checking wiring...",
      platform,
      status: overall === "connected" ? "active" : overall === "partial" ? "idle" : "dormant",
      lastHeartbeat: null,
      currentTask: null,
      lessonsCount: 0,
      todayMemoryCount: 0,
      location: "local" as const,
      isRemote: false,
      latencyMs: null,
      agentKind: "devtool" as const,
      icon,
    };
  });

  const agenticAgents = [...localAgents.map(a => ({ ...a, agentKind: "agentic" as const })), ...remoteAgents];
  // On Shift = agentic agents actually running tasks/heartbeating (not dev tools — those are config state)
  const onShift = agenticAgents.filter((a) => a.status === "active").length;
  const errors = agenticAgents.filter((a) => a.status === "error").length;
  const tasks = agenticAgents.filter((a) => a.currentTask && !a.isRemote).length;
  // Dev tools: connected = fully wired, partial = partially wired, not-wired = gap
  const devToolsConnected = devToolAgents.filter((a) => a.status === "active").length;
  const devToolsPartial = devToolAgents.filter((a) => a.status === "idle").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Kitchen Floor</h1>
        <p className="text-sm text-slate-400">Real-time agent status board</p>
      </div>
      <SummaryBar
        agentTotal={agenticAgents.length}
        onShift={onShift}
        tasks={tasks}
        errors={errors}
        devToolsConnected={devToolsConnected}
        devToolsPartial={devToolsPartial}
        devToolsTotal={devToolAgents.length}
      />
      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <AgentGrid agenticAgents={agenticAgents} devToolAgents={devToolAgents} />
      )}
    </div>
  );
}
