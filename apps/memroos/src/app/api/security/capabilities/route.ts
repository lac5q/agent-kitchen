import { listRegisteredAgents } from "@/lib/agent-registry";
import {
  classifyLiveness,
  type LivenessObservation,
} from "@/lib/agent-liveness";
import { metricEnvelope, type MetricEnvelope, type MetricScope } from "@/lib/metric-status";
import type { RegisteredAgent } from "@/types";

export const dynamic = "force-dynamic";

type SecurityMode = "strict" | "standard" | "permissive";

const SECURITY_CAPABILITY_TERMS = ["agent-shield", "iris", "policy", "security", "trust"];

function defaultSecurityMode(): SecurityMode {
  const raw = process.env.MEMROOS_SECURITY_MODE;
  return raw === "strict" || raw === "permissive" ? raw : "standard";
}

function modeFor(agent: RegisteredAgent, fallback: SecurityMode): SecurityMode {
  const raw = agent.metadata?.securityMode;
  return raw === "strict" || raw === "standard" || raw === "permissive" ? raw : fallback;
}

function securityCapabilities(agent: RegisteredAgent): string[] {
  return agent.capabilities
    .filter((capability) => {
      const haystack = `${capability.id} ${capability.name} ${capability.description} ${capability.tags.join(" ")}`.toLowerCase();
      return SECURITY_CAPABILITY_TERMS.some((term) => haystack.includes(term));
    })
    .map((capability) => capability.id);
}

function readinessScore(agent: RegisteredAgent, mode: SecurityMode, capabilities: string[]): number {
  let score = mode === "strict" ? 55 : mode === "standard" ? 40 : 25;
  if (agent.status === "active") score += 15;
  if (capabilities.length > 0) score += 20;
  if (agent.protocol === "a2a" || agent.protocol === "rest") score += 10;
  return Math.min(100, score);
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

export interface SecurityCapabilitiesSummaryMetrics {
  totalAgents: MetricEnvelope<number>;
  strictAgents: MetricEnvelope<number>;
  standardAgents: MetricEnvelope<number>;
  permissiveAgents: MetricEnvelope<number>;
  agentsWithSecurityCapabilities: MetricEnvelope<number>;
}

export interface SecurityCapabilitiesPoliciesView {
  defaultMode: string;
  dispatchPolicy: string;
  a2aPolicy: string;
  memoryWritePolicy: string;
  metric: MetricEnvelope<number>;
}

function countEnvelope(
  count: number,
  scope: MetricScope,
  observedAt: string | null,
  freshnessMs: number | null,
  source: string,
  hasAnyAgents: boolean,
  reason: string
): MetricEnvelope<number> {
  if (!hasAnyAgents) {
    return metricEnvelope<number>({
      value: 0,
      status: "empty",
      source,
      observedAt: null,
      freshnessMs: null,
      scope,
      reason: `No agents are registered; ${reason.toLowerCase()}, not zero`,
    });
  }
  return metricEnvelope<number>({
    value: count,
    status: count > 0 ? "live" : "zero",
    source,
    observedAt,
    freshnessMs,
    scope,
    reason,
  });
}

export function GET() {
  const fallbackMode = defaultSecurityMode();
  const baseAgents = listRegisteredAgents();
  const scope: MetricScope = { window: "lifetime", workspace: "all" };
  const observations: LivenessObservation[] = baseAgents.map((agent) =>
    classifyLiveness({ lastHeartbeat: agent.lastHeartbeat })
  );
  const observedAt = latestObservedAt(observations);
  const freshnessMs = freshestFreshness(observations);

  const agents = baseAgents.map((agent) => {
    const mode = modeFor(agent, fallbackMode);
    const capabilities = securityCapabilities(agent);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      protocol: agent.protocol,
      status: agent.status,
      securityMode: mode,
      securityCapabilities: capabilities,
      readinessScore: readinessScore(agent, mode, capabilities),
      lastHeartbeat: agent.lastHeartbeat,
      liveness: classifyLiveness({ lastHeartbeat: agent.lastHeartbeat }),
    };
  });

  const hasAnyAgents = agents.length > 0;
  const strictCount = agents.filter((agent) => agent.securityMode === "strict").length;
  const standardCount = agents.filter((agent) => agent.securityMode === "standard").length;
  const permissiveCount = agents.filter((agent) => agent.securityMode === "permissive").length;
  const capsCount = agents.filter((agent) => agent.securityCapabilities.length > 0).length;

  const metrics: SecurityCapabilitiesSummaryMetrics = {
    totalAgents: countEnvelope(
      agents.length,
      scope,
      observedAt,
      freshnessMs,
      "sqlite://registered_agents",
      hasAnyAgents,
      `${agents.length} registered agents`
    ),
    strictAgents: countEnvelope(
      strictCount,
      scope,
      observedAt,
      freshnessMs,
      "sqlite://registered_agents.metadata.securityMode",
      hasAnyAgents,
      `${strictCount} agents with strict security mode`
    ),
    standardAgents: countEnvelope(
      standardCount,
      scope,
      observedAt,
      freshnessMs,
      "sqlite://registered_agents.metadata.securityMode",
      hasAnyAgents,
      `${standardCount} agents with standard security mode`
    ),
    permissiveAgents: countEnvelope(
      permissiveCount,
      scope,
      observedAt,
      freshnessMs,
      "sqlite://registered_agents.metadata.securityMode",
      hasAnyAgents,
      `${permissiveCount} agents with permissive security mode`
    ),
    agentsWithSecurityCapabilities: countEnvelope(
      capsCount,
      scope,
      observedAt,
      freshnessMs,
      "sqlite://agent_capabilities",
      hasAnyAgents,
      `${capsCount} agents have at least one declared security capability`
    ),
  };

  const policiesMetric = metricEnvelope<number>({
    value: 1,
    status: "live",
    source: `env://MEMROOS_SECURITY_MODE=${fallbackMode}`,
    observedAt,
    freshnessMs,
    scope,
    reason: `dispatch/a2a/memory policies are enforced; default mode inherited from MEMROOS_SECURITY_MODE=${fallbackMode}`,
  });

  const policies: SecurityCapabilitiesPoliciesView = {
    defaultMode: fallbackMode,
    dispatchPolicy: "enforced",
    a2aPolicy: "enforced",
    memoryWritePolicy: "enforced",
    metric: policiesMetric,
  };

  return Response.json({
    summary: {
      // Scalar fields preserved for backward compatibility.
      totalAgents: agents.length,
      strictAgents: strictCount,
      standardAgents: standardCount,
      permissiveAgents: permissiveCount,
      agentsWithSecurityCapabilities: capsCount,
      // Truthful envelopes layered on top of the scalar fields.
      metrics,
    },
    policies,
    agents,
    timestamp: new Date().toISOString(),
  });
}
