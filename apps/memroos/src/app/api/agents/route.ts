import { listRegisteredAgents } from "@/lib/agent-registry";
import { getDb } from "@/lib/db";
import { getLocalAgentRuntime } from "@/lib/local-agent-runtime";
import type { AgentPlatform, RegisteredAgent } from "@/types";

export const dynamic = "force-dynamic";

const RECENT_ACTIVITY_WINDOW_MS = 30 * 60 * 1000;
const SINGLETON_CLI_AGENT_BY_PLATFORM: Partial<Record<AgentPlatform, string>> = {
  claude: "claude-code-luis-mbp",
  codex: "codex-desktop-luis-mbp",
  gemini: "gemini-cli-luis-mbp",
  qwen: "qwen-cli-luis-mbp",
};
const PLATFORM_RUNTIME_AGENTS = new Set<AgentPlatform>(["hermes", "openclaw", "opencode"]);

interface RecentHiveActionRow {
  agent_id: string;
  summary: string;
  timestamp: string;
}

function recentHiveActivityByAgent(): Map<string, RecentHiveActionRow> {
  const cutoff = new Date(Date.now() - RECENT_ACTIVITY_WINDOW_MS).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT agent_id, summary, timestamp
       FROM hive_actions
       WHERE timestamp >= ?
       ORDER BY timestamp DESC`
    )
    .all(cutoff) as RecentHiveActionRow[];

  const latestByAgent = new Map<string, RecentHiveActionRow>();
  for (const row of rows) {
    if (!latestByAgent.has(row.agent_id)) latestByAgent.set(row.agent_id, row);
  }
  return latestByAgent;
}

function withDerivedActivity(agents: RegisteredAgent[], localRuntime: ReturnType<typeof getLocalAgentRuntime>): RegisteredAgent[] {
  const recentActivity = recentHiveActivityByAgent();
  const activeCliAgentIds = new Set(
    Object.entries(SINGLETON_CLI_AGENT_BY_PLATFORM)
      .filter(([platform]) => (localRuntime.byPlatform[platform as AgentPlatform] ?? 0) > 0)
      .map(([, agentId]) => agentId)
      .filter((agentId): agentId is string => Boolean(agentId))
  );

  return agents.map((agent) => {
    const latestAction = recentActivity.get(agent.id);
    const platformRuntimeActive =
      PLATFORM_RUNTIME_AGENTS.has(agent.platform) &&
      (localRuntime.byPlatform[agent.platform] ?? 0) > 0;
    const localCliActive = activeCliAgentIds.has(agent.id) || platformRuntimeActive;
    if (!latestAction && !localCliActive) return agent;

    const derivedTimestamp = latestAction?.timestamp ?? localRuntime.scannedAt;
    return {
      ...agent,
      status: agent.status === "error" ? agent.status : "active",
      lastHeartbeat: agent.lastHeartbeat ?? derivedTimestamp,
      currentTask:
        agent.currentTask ??
        latestAction?.summary ??
        `Local ${agent.platform} runtime detected`,
      metadata: {
        ...agent.metadata,
        derivedActivity: latestAction
          ? "recent_hive_action"
          : "local_runtime_process",
      },
    };
  });
}

export function GET() {
  const localRuntime = getLocalAgentRuntime();
  const agents = withDerivedActivity(listRegisteredAgents(), localRuntime);
  return Response.json({
    agents,
    localRuntime,
    timestamp: new Date().toISOString(),
  });
}
