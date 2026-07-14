/**
 * MSIQ-05 (VAL-ORCH-008): Per-source independent policy evaluation.
 *
 * Authorization, scope, freshness, label, purpose, belief-stage, and
 * injection status are evaluated per source/result. One allowed
 * source cannot authorize another.
 */


import { authorizeMemoryUse, type MemoryLabelSnapshot, type MemoryUseActor, type MemoryUsePurpose } from "@/lib/memory/policy-gate";
import type { FederationSourceRow } from "./source-registry";

export interface FederationPolicyContext {
  actor: MemoryUseActor;
  purpose: MemoryUsePurpose;
  label: MemoryLabelSnapshot;
  beliefStage: string;
  scopeHash: string;
  maxFreshnessSeconds?: number | null;
}

export type FederationPolicyDecision =
  | { kind: "allow"; reason: string; policyVersion: string }
  | { kind: "deny"; reason: string; policyVersion: string }
  | { kind: "redact"; reason: string; policyVersion: string }
  | { kind: "review_required"; reason: string; policyVersion: string }
  | { kind: "stale"; reason: string; policyVersion: string };
export const FEDERATION_POLICY_VERSION = "federation-v1";

export function evaluateFederationPolicy(args: {
  source: FederationSourceRow;
  context: FederationPolicyContext;
  candidateFreshnessSeconds?: number | null;
}): FederationPolicyDecision {
  const { source, context } = args;
  if (source.purpose !== context.purpose) {
    return { kind: "deny", reason: "purpose_mismatch", policyVersion: FEDERATION_POLICY_VERSION };
  }
  if (source.spaceId && context.actor.project && source.spaceId !== context.actor.project) {
    // space-scoped source + cross-space actor => deny
    return { kind: "deny", reason: "space_mismatch", policyVersion: FEDERATION_POLICY_VERSION };
  }
  if (args.candidateFreshnessSeconds !== undefined && args.candidateFreshnessSeconds !== null
    && context.maxFreshnessSeconds !== undefined && context.maxFreshnessSeconds !== null
    && args.candidateFreshnessSeconds > context.maxFreshnessSeconds) {
    return { kind: "stale", reason: "stale", policyVersion: FEDERATION_POLICY_VERSION } as FederationPolicyDecision;
  }
  const decision = authorizeMemoryUse({
    actor: context.actor,
    purpose: context.purpose,
    label: context.label,
  });
  if (decision.decision === "allow") {
    return { kind: "allow", reason: decision.reason, policyVersion: FEDERATION_POLICY_VERSION };
  }
  if (decision.decision === "deny") {
    return { kind: "deny", reason: decision.reason, policyVersion: FEDERATION_POLICY_VERSION };
  }
  if (decision.decision === "redact") {
    return { kind: "redact", reason: decision.reason, policyVersion: FEDERATION_POLICY_VERSION };
  }
  return { kind: "review_required", reason: decision.reason, policyVersion: FEDERATION_POLICY_VERSION };
}
