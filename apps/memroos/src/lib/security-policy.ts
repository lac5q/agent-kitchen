import { getA2aConfig } from "@/lib/a2a/config";
import type { MemoryTier } from "@/lib/memory/tiers";
import type { RegisteredAgent, RegisteredAgentCapability, RemoteAgentConfig } from "@/types";

export interface PolicyDecision {
  allowed: boolean;
  code?: "MISSING_CAPABILITY" | "NETWORK_POLICY_DENIED";
  message?: string;
  detail?: Record<string, unknown>;
}

const DISPATCH_CAPABILITIES = new Set([
  "dispatch",
  "task:accept",
  "task.accept",
  "capability:dispatch",
  "a2a:receive",
  "a2a:message",
]);

const A2A_SEND_CAPABILITIES = new Set([
  "a2a:send",
  "a2a:message",
  "dispatch",
  "capability:dispatch",
]);

function capabilityIds(capabilities: RegisteredAgentCapability[] | undefined): string[] {
  return (capabilities ?? []).map((capability) => capability.id.toLowerCase());
}

function skillIds(skills: RemoteAgentConfig["skills"] | undefined): string[] {
  return (skills ?? []).map((skill) => skill.id.toLowerCase());
}

function allowLegacyWhenUndeclared(ids: string[], authenticatedAsAgent = false): boolean {
  if (ids.length !== 0 || authenticatedAsAgent) return false;
  const profile = process.env.MEMROOS_A2A_PROFILE ?? "local-dev";
  const explicit = process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES;
  if (explicit !== undefined) return ["1", "true", "yes", "on"].includes(explicit.toLowerCase());
  return process.env.NODE_ENV !== "production" && profile === "local-dev";
}

function hasAny(ids: string[], allowed: Set<string>): boolean {
  return ids.some((id) => allowed.has(id));
}

function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
  return false;
}

function remoteHostname(agent: RemoteAgentConfig): string {
  const endpointUrl =
    agent.metadata?.a2a &&
    typeof agent.metadata.a2a === "object" &&
    !Array.isArray(agent.metadata.a2a) &&
    typeof (agent.metadata.a2a as Record<string, unknown>).endpointUrl === "string"
      ? ((agent.metadata.a2a as Record<string, unknown>).endpointUrl as string)
      : null;

  if (endpointUrl) {
    try {
      return new URL(endpointUrl).hostname;
    } catch {
      return agent.host;
    }
  }

  return agent.host;
}

export function checkDispatchPolicy(fromAgentId: string, targetAgent: RemoteAgentConfig): PolicyDecision {
  const config = getA2aConfig();
  const host = remoteHostname(targetAgent);

  if (!config.allowPrivateNetworkCards && isPrivateNetworkHost(host)) {
    return {
      allowed: false,
      code: "NETWORK_POLICY_DENIED",
      message: "Remote target is blocked by operating profile network policy",
      detail: { fromAgentId, targetAgentId: targetAgent.id, host },
    };
  }

  const ids = skillIds(targetAgent.skills);
  if (allowLegacyWhenUndeclared(ids, fromAgentId.startsWith("agent:")) || hasAny(ids, DISPATCH_CAPABILITIES)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: "MISSING_CAPABILITY",
    message: "Target agent does not declare dispatch capability",
    detail: {
      fromAgentId,
      targetAgentId: targetAgent.id,
      required: Array.from(DISPATCH_CAPABILITIES),
      declared: ids,
    },
  };
}

export function checkA2aSendPolicy(agent: RegisteredAgent): PolicyDecision {
  const ids = capabilityIds(agent.capabilities);
  if (allowLegacyWhenUndeclared(ids, true) || hasAny(ids, A2A_SEND_CAPABILITIES)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: "MISSING_CAPABILITY",
    message: "Caller agent does not declare A2A send capability",
    detail: {
      agentId: agent.id,
      required: Array.from(A2A_SEND_CAPABILITIES),
      declared: ids,
    },
  };
}

export function checkMemoryWritePolicy(agent: RegisteredAgent, tier: MemoryTier): PolicyDecision {
  const ids = capabilityIds(agent.capabilities);
  if (allowLegacyWhenUndeclared(ids)) return { allowed: true };

  const allowed = new Set(["memory:write", `memory:${tier}`, `memory:write:${tier}`]);
  if (hasAny(ids, allowed)) return { allowed: true };

  return {
    allowed: false,
    code: "MISSING_CAPABILITY",
    message: `Agent is not allowed to write ${tier} memory`,
    detail: {
      agentId: agent.id,
      tier,
      required: Array.from(allowed),
      declared: ids,
    },
  };
}
