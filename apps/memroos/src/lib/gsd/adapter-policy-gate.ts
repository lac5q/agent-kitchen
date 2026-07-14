/**
 * Phase 145 (FLEET-13..16): Pre-execution policy gate for GSD adapter actions.
 *
 * Thin wrapper around the POLGOV policy engine. The gate runs AFTER the
 * GSD safety check (secrets/PII, destructive action, cost cap) and BEFORE the
 * adapter action is executed. It is fail-closed: an exception from the policy
 * engine is treated as a deny.
 *
 * INVARIANT: no policy logic is reimplemented here. Every decision is
 * delegated to `evaluatePolicy` in `@/lib/policy/engine`.
 */

import type Database from "better-sqlite3";

import {
  evaluatePolicy,
  type PolicyEvaluation,
  type PolicyRequest,
} from "@/lib/policy/engine";
import type { GsdAdapterAction, GsdAdapterId } from "@/lib/gsd/adapters";
import type { AgentLocation, AgentPlatform, RemoteAgentConfig } from "@/types";

export interface GsdAdapterPolicyGateInput {
  adapterId: GsdAdapterId;
  action: GsdAdapterAction;
  actorAgentId: string;
}

function adapterPlatform(adapterId: GsdAdapterId): AgentPlatform {
  // Map GSD adapter ids to the canonical AgentPlatform vocabulary. The
  // platform is part of the RemoteAgentConfig shape but is not used by the
  // capability decision itself; the mapping only needs to be type-safe.
  switch (adapterId) {
    case "hermes":
      return "hermes";
    case "codex":
      return "codex";
    case "claude_code":
      return "claude";
    case "cursor":
      return "cursor";
    case "discord":
    case "telegram":
    default:
      return "hermes" as AgentPlatform;
  }
}

function buildGsdTargetAgent(adapterId: GsdAdapterId): RemoteAgentConfig {
  // The GSD adapter boundary is not a true A2A remote agent, but the POLGOV
  // capability domain uses the RemoteAgentConfig shape for dispatch policy.
  // We synthesize a minimal, safe config with only ids and adapter metadata.
  return {
    id: adapterId,
    name: adapterId,
    role: "adapter",
    platform: adapterPlatform(adapterId),
    // "gsd" is not in the AgentProtocol enum, but checkDispatchPolicy does not
    // inspect protocol; casting keeps the shape intact without widening the enum.
    protocol: "gsd" as unknown as RemoteAgentConfig["protocol"],
    location: "local" as AgentLocation,
    host: "gsd",
    port: 0,
    healthEndpoint: "/health",
    skills: [],
  };
}

/**
 * Evaluate the policy gate for a GSD adapter action. Returns the full
 * POLGOV PolicyEvaluation (receipt + underlying capability decision). If the
 * engine throws, the gate returns a deny receipt so the caller can treat it
 * as a deny without crashing the adapter route.
 */
export function runGsdAdapterPolicyGate(
  db: Database.Database | undefined,
  input: GsdAdapterPolicyGateInput
): PolicyEvaluation {
  const targetAgent = buildGsdTargetAgent(input.adapterId);

  const req: PolicyRequest = {
    domain: "capability",
    action: input.action,
    actor: { id: input.actorAgentId, role: "agent" },
    capability: {
      kind: "dispatch",
      fromAgentId: input.actorAgentId,
      targetAgent,
    },
  };

  try {
    return evaluatePolicy(req, db);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "policy_gate_exception";
    const now = new Date().toISOString();
    return {
      receipt: {
        policyVersion: "unknown",
        domain: "capability",
        action: input.action,
        ruleMatched: "gate.error",
        outcome: "deny",
        reason,
        actorId: input.actorAgentId,
        actorRole: "system",
        tenantId: "default-tenant",
        createdAt: now,
      },
      capability: {
        allowed: false,
        message: reason,
      },
    };
  }
}

/**
 * Convenience helper. Returns true only when the receipt outcome is "allow".
 */
export function isGsdAdapterPolicyAllowed(evaluation: PolicyEvaluation): boolean {
  return evaluation.receipt.outcome === "allow";
}
