import { listRegisteredAgents } from "@/lib/agent-registry";
import { getDb } from "@/lib/db";
import { getLocalAgentRuntime } from "@/lib/local-agent-runtime";
import {
  buildLivenessEnvelope,
  classifyLiveness,
  summarizeLivenessStates,
  summarizeReadiness,
  type LivenessObservation,
} from "@/lib/agent-liveness";
import { metricEnvelope, type MetricEnvelope, type MetricScope } from "@/lib/metric-status";
import type { AgentPlatform, AgentProtocol, RegisteredAgent } from "@/types";

export const dynamic = "force-dynamic";

const RECENT_ACTIVITY_WINDOW_MS = 30 * 60 * 1000;
const SINGLETON_CLI_AGENT_BY_PLATFORM: Partial<Record<AgentPlatform, string>> = {
  claude: "claude-code-luis-mbp",
  codex: "codex-desktop-luis-mbp",
  gemini: "gemini-cli-luis-mbp",
  qwen: "qwen-cli-luis-mbp",
  zcode: "zcode-desktop-luis-mbp",
  pi: "pi-desktop-luis-mbp",
  grok: "grok-desktop-luis-mbp",
  droid: "droid-desktop-luis-mbp",
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

export interface AgentLivenessView extends RegisteredAgent {
  /** Truthful liveness observation for the agent (live/stale/never/missing/error). */
  liveness: LivenessObservation;
}

export interface AgentsSummary {
  total: MetricEnvelope<number>;
  active: MetricEnvelope<number>;
  idle: MetricEnvelope<number>;
  dormant: MetricEnvelope<number>;
  error: MetricEnvelope<number>;
}

export interface AgentsProtocolSummary {
  rest: MetricEnvelope<number>;
  a2a: MetricEnvelope<number>;
  ui: MetricEnvelope<number>;
  local: MetricEnvelope<number>;
}

export interface AgentsReadiness {
  average: MetricEnvelope<number | null>;
  withCapabilities: MetricEnvelope<number>;
}

export interface AgentsLocalRuntimeView {
  ok: boolean;
  metric: MetricEnvelope<number>;
}

function buildScope(): MetricScope {
  return { window: "lifetime", workspace: "all" };
}

function latestObservedAt(observations: LivenessObservation[]): string | null {
  let candidate: string | null = null;
  for (const obs of observations) {
    if (!obs.observedAt) continue;
    if (candidate === null || Date.parse(obs.observedAt) > Date.parse(candidate)) {
      candidate = obs.observedAt;
    }
  }
  return candidate;
}

function freshestFreshness(observations: LivenessObservation[]): number | null {
  let candidate: number | null = null;
  for (const obs of observations) {
    if (obs.freshnessMs === null) continue;
    if (candidate === null || obs.freshnessMs > candidate) {
      candidate = obs.freshnessMs;
    }
  }
  return candidate;
}

export function GET() {
  let localRuntime: ReturnType<typeof getLocalAgentRuntime>;
  let localRuntimeOk = true;
  let localRuntimeError: string | null = null;
  try {
    localRuntime = getLocalAgentRuntime();
  } catch (error) {
    localRuntime = {
      activeCliCount: 0,
      byPlatform: {},
      scannedAt: new Date().toISOString(),
    };
    localRuntimeOk = false;
    localRuntimeError = error instanceof Error ? error.message : String(error);
  }

  const baseAgents = listRegisteredAgents();
  const agents: AgentLivenessView[] = withDerivedActivity(baseAgents, localRuntime).map(
    (agent) => {
      // withDerivedActivity already merged local-runtime activity into the
      // agent's lastHeartbeat for agents that the host-local runtime proves
      // are alive. Passing localRuntime.scannedAt here would incorrectly
      // mark never-heartbeat agents as fresh.
      const observation = classifyLiveness({
        lastHeartbeat: agent.lastHeartbeat,
      });
      return { ...agent, liveness: observation };
    }
  );

  const observations = agents.map((agent) => agent.liveness);
  const counts = summarizeLivenessStates(observations);
  const observedAt = latestObservedAt(observations);
  const freshnessMs = freshestFreshness(observations);
  const scope = buildScope();

  const livenessEnvelope = buildLivenessEnvelope({
    counts,
    scope,
    observedAt,
    freshnessMs,
    sourceOk: true,
  });

  const activeCount = agents.filter((agent) => agent.status === "active").length;
  const idleCount = agents.filter((agent) => agent.status === "idle").length;
  const dormantCount = agents.filter((agent) => agent.status === "dormant").length;
  const errorCount = agents.filter((agent) => agent.status === "error").length;

  // Count totals are truthful only when the underlying status field came
  // from a successful read. Since listRegisteredAgents already returned a
  // result, sourceOk is true here. We still use metricEnvelope so a future
  // failure path can flip it to error without changing the page contract.
  const totalEnvelope = metricEnvelope<number>({
    value: agents.length,
    status: "live",
    source: "sqlite://registered_agents",
    observedAt,
    freshnessMs,
    scope,
    reason: `${agents.length} registered agents in roster`,
  });
  const activeEnvelope = metricEnvelope<number>({
    value: activeCount,
    status: counts.live === agents.length && agents.length > 0 ? "live" : "degraded",
    source: "sqlite://registered_agents.status",
    observedAt,
    freshnessMs,
    scope,
    reason: `${activeCount} of ${agents.length} agents report status=active; liveness summary is ${livenessEnvelope.status}`,
  });
  function statusCountStatus(count: number): "live" | "zero" | "empty" {
    if (agents.length === 0) return "empty";
    return count > 0 ? "live" : "zero";
  }
  function statusCountReason(count: number, label: string): string {
    if (agents.length === 0) return "No agents are registered";
    if (count > 0) return `${count} agents report status=${label}`;
    return `No agents currently report status=${label}`;
  }
  const idleEnvelope = metricEnvelope<number>({
    value: idleCount,
    status: statusCountStatus(idleCount),
    source: "sqlite://registered_agents.status",
    observedAt,
    freshnessMs,
    scope,
    reason: statusCountReason(idleCount, "idle"),
  });
  const dormantEnvelope = metricEnvelope<number>({
    value: dormantCount,
    status: statusCountStatus(dormantCount),
    source: "sqlite://registered_agents.status",
    observedAt,
    freshnessMs,
    scope,
    reason: statusCountReason(dormantCount, "dormant"),
  });
  const errorStatusEnvelope = metricEnvelope<number>({
    value: errorCount,
    status: statusCountStatus(errorCount),
    source: "sqlite://registered_agents.status",
    observedAt,
    freshnessMs,
    scope,
    reason: statusCountReason(errorCount, "error"),
  });

  // Protocol counts are per-protocol envelopes so each protocol summary is
  // truthful in its own right (no protocol total collapses to zero on a
  // missing roster).
  function protocolStatus(name: AgentProtocol): "live" | "zero" | "empty" {
    if (agents.length === 0) return "empty";
    const count = agents.filter((agent) => agent.protocol === name).length;
    return count > 0 ? "live" : "zero";
  }
  function protocolReason(name: AgentProtocol): string {
    if (agents.length === 0) return "No agents are registered; protocol count is empty, not zero";
    const count = agents.filter((agent) => agent.protocol === name).length;
    return `${count} ${name}-protocol registered agents`;
  }
  const protocols: AgentsProtocolSummary = {
    rest: metricEnvelope<number>({
      value: agents.filter((agent) => agent.protocol === ("rest" satisfies AgentProtocol)).length,
      status: protocolStatus("rest"),
      source: "sqlite://registered_agents.protocol",
      observedAt,
      freshnessMs,
      scope,
      reason: protocolReason("rest"),
    }),
    a2a: metricEnvelope<number>({
      value: agents.filter((agent) => agent.protocol === ("a2a" satisfies AgentProtocol)).length,
      status: protocolStatus("a2a"),
      source: "sqlite://registered_agents.protocol",
      observedAt,
      freshnessMs,
      scope,
      reason: protocolReason("a2a"),
    }),
    ui: metricEnvelope<number>({
      value: agents.filter((agent) => agent.protocol === ("ui" satisfies AgentProtocol)).length,
      status: protocolStatus("ui"),
      source: "sqlite://registered_agents.protocol",
      observedAt,
      freshnessMs,
      scope,
      reason: protocolReason("ui"),
    }),
    local: metricEnvelope<number>({
      value: agents.filter((agent) => agent.protocol === ("local" satisfies AgentProtocol)).length,
      status: protocolStatus("local"),
      source: "sqlite://registered_agents.protocol",
      observedAt,
      freshnessMs,
      scope,
      reason: protocolReason("local"),
    }),
  };

  // Readiness averages come from /api/security/capabilities. To keep this
  // route independent, we recompute the score here using the same logic so
  // the truth of "average readiness" never depends on a separate request.
  const readinessScores = agents.map((agent) => {
    const isStrict =
      agent.metadata && typeof agent.metadata.securityMode === "string" &&
      agent.metadata.securityMode === "strict";
    const isPermissive =
      agent.metadata && typeof agent.metadata.securityMode === "string" &&
      agent.metadata.securityMode === "permissive";
    let score = isStrict ? 55 : isPermissive ? 25 : 40;
    if (agent.status === "active") score += 15;
    if (agent.capabilities.length > 0) score += 20;
    if (agent.protocol === "a2a" || agent.protocol === "rest") score += 10;
    return Math.min(100, score);
  });
  const readiness = summarizeReadiness(readinessScores);
  const readinessAverageEnvelope: MetricEnvelope<number | null> = metricEnvelope<number | null>({
    value: readiness.average,
    status: readiness.total === 0 ? "empty" : "live",
    source: "computed://registered_agents.readiness",
    observedAt,
    freshnessMs,
    scope,
    reason:
      readiness.total === 0
        ? "No agents are registered; readiness average is not a measured zero"
        : `Average readiness across ${readiness.total} registered agents`,
  });
  const readinessCapsEnvelope = metricEnvelope<number>({
    value: readiness.withCapabilities,
    status:
      readiness.total === 0
        ? "empty"
        : readiness.withCapabilities > 0
          ? "live"
          : "zero",
    source: "computed://registered_agents.readiness",
    observedAt,
    freshnessMs,
    scope,
    reason:
      readiness.total === 0
        ? "No agents are registered; readiness count is empty, not zero"
        : `${readiness.withCapabilities} of ${readiness.total} agents have non-zero readiness`,
  });

  const localRuntimeEnvelope: MetricEnvelope<number> = localRuntimeOk
    ? metricEnvelope<number>({
        value: localRuntime.activeCliCount,
        status: "live",
        source: "host://local-agent-runtime.scan",
        observedAt: localRuntime.scannedAt,
        freshnessMs: Math.max(0, Date.now() - Date.parse(localRuntime.scannedAt)),
        scope,
        reason: `${localRuntime.activeCliCount} active CLI sessions across ${Object.keys(localRuntime.byPlatform).length} platforms`,
      })
    : metricEnvelope<number>({
        value: null,
        status: "unavailable",
        source: "host://local-agent-runtime.scan",
        observedAt: null,
        freshnessMs: null,
        scope,
        reason: localRuntimeError
          ? `Local runtime scan is unavailable in this environment; agents cannot derive activity from CLI processes (${localRuntimeError})`
          : "Local runtime scan is unavailable in this environment; agents cannot derive activity from CLI processes",
      });

  const summary: AgentsSummary = {
    total: totalEnvelope,
    active: activeEnvelope,
    idle: idleEnvelope,
    dormant: dormantEnvelope,
    error: errorStatusEnvelope,
  };

  const readinessSummary: AgentsReadiness = {
    average: readinessAverageEnvelope,
    withCapabilities: readinessCapsEnvelope,
  };

  const localRuntimeView: AgentsLocalRuntimeView = {
    ok: localRuntimeOk,
    metric: localRuntimeEnvelope,
  };

  return Response.json({
    agents,
    summary,
    liveness: livenessEnvelope,
    readiness: readinessSummary,
    protocols,
    localRuntime: localRuntimeView,
    timestamp: new Date().toISOString(),
  });
}
