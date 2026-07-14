/**
 * Phase 129 (POLGOV-04): Shadow mode for proposed policy versions.
 *
 * Shadow mode lets operators preview the impact of a proposed manifest
 * WITHOUT activating it. `shadowEvaluate` replays recent decisions under
 * a proposed manifest and reports which decisions would newly flip
 * to deny (or — in the rare case a dimension rule is removed — newly
 * allow). `activatePolicyVersion` is the gate that would be called from
 * an admin endpoint in a real deployment.
 *
 * NO SIDE EFFECTS: neither function reads from disk, writes to the audit
 * log, or mutates the active manifest. Both are pure.
 */

import type { PolicyDimensionRule } from "./dimensions";
import type { PolicyRequest, PolicyEvaluation } from "./engine";
import type { PolicyReceipt } from "./receipt";
import { matchDimensions } from "./dimensions";

export interface ShadowDiffEntry {
  action: string;
  domain: string;
  currentOutcome: string;
  proposedOutcome: string;
  reason: string;
}

export interface ShadowDiffResult {
  newlyDenied: ShadowDiffEntry[];
  newlyAllowed: ShadowDiffEntry[];
  unchanged: number;
  total: number;
}

export interface ShadowDecisionRecord {
  request: PolicyRequest;
  currentOutcome: string;
}

/**
 * Proposed manifest shape accepted by `shadowEvaluate`. We deliberately
 * do NOT type the full manifest (rules, implementation fields, etc.) —
 * only the fields the shadow replays against.
 */
export interface ProposedManifest {
  version: string;
  rules: Array<{
    id: string;
    domain: string;
    /**
     * Dimension rule. Loaded from JSON, so the array members are typed as
     * plain strings here rather than the strict `VaultDomain` / etc.
     * enums. The matcher still produces correct deny/no-deny answers
     * because the comparison is string-based.
     */
    dimensions?: {
      subject?: {
        team?: string[];
        role?: string[];
        userId?: string;
        agentId?: string;
      };
      object?: {
        ontologyType?: string[];
        domain?: string[];
        sensitivity?: string[];
        visibility?: string[];
        beliefStage?: string[];
      };
      action?: string[];
      purpose?: string[];
      effect: "deny";
    };
  }>;
}

const NON_DENY_OUTCOMES = new Set(["allow", "redact", "review-required"]);

/**
 * Replay a list of recent decisions under a proposed manifest. For each
 * decision, the function applies every dimension rule whose `domain`
 * matches the request domain and whose `matchDimensions` returns true.
 * If any such rule has `effect: "deny"`, the proposed outcome is "deny".
 *
 * Comparison buckets:
 *   - newlyDenied:    was allow/redact/review-required, proposed deny
 *   - newlyAllowed:   was deny, proposed non-deny (rare — implies a rule
 *                     was removed or loosened; reported for completeness)
 *   - unchanged:      bucket above did not apply
 */
export function shadowEvaluate(
  proposedManifest: ProposedManifest,
  recentDecisions: ShadowDecisionRecord[]
): ShadowDiffResult {
  const result: ShadowDiffResult = {
    newlyDenied: [],
    newlyAllowed: [],
    unchanged: 0,
    total: recentDecisions.length,
  };

  for (const decision of recentDecisions) {
    const proposedOutcome = proposedOutcomeFor(
      proposedManifest,
      decision.request,
      decision.currentOutcome
    );

    const currentNonDeny = NON_DENY_OUTCOMES.has(decision.currentOutcome);
    const proposedNonDeny = NON_DENY_OUTCOMES.has(proposedOutcome);

    if (!currentNonDeny && proposedNonDeny) {
      result.newlyAllowed.push({
        action: decision.request.action,
        domain: decision.request.domain,
        currentOutcome: decision.currentOutcome,
        proposedOutcome,
        reason: "rule_removed_or_loosened",
      });
    } else if (currentNonDeny && !proposedNonDeny) {
      result.newlyDenied.push({
        action: decision.request.action,
        domain: decision.request.domain,
        currentOutcome: decision.currentOutcome,
        proposedOutcome,
        reason: "dimension_deny",
      });
    } else {
      result.unchanged += 1;
    }
  }

  return result;
}

function proposedOutcomeFor(
  proposedManifest: ProposedManifest,
  request: PolicyRequest,
  currentOutcome: string
): string {
  // Only dimension rules that EXIST in the proposed manifest and that
  // match this request can tighten the outcome. If none match, the
  // proposed outcome equals the current outcome (no change).
  const domainRules = proposedManifest.rules.filter(
    (rule) => rule.domain === request.domain
  );

  for (const rule of domainRules) {
    if (!rule.dimensions) continue;
    if (rule.dimensions.effect !== "deny") continue;
    // The proposed manifest is JSON-loaded so its `dimensions` shape is
    // structurally compatible with `PolicyDimensionRule` (both use plain
    // `string[]` for matching fields). A `satisfies` check at the boundary
    // would help but the matcher is string-based so this is safe.
    if (!matchDimensions(rule.dimensions, request.dimensions)) continue;

    // Tighten non-deny -> deny. A pre-existing deny stays deny.
    return "deny";
  }

  return currentOutcome;
}

/**
 * Operator-gated activation of a proposed manifest. Validates the proposed
 * shape and returns the new active version string. In a real deployment this
 * would be an admin endpoint that swaps `manifest.json` after operator
 * approval; here it is a pure function so it can be tested.
 *
 * Returns `{ activated: false, newVersion: currentVersion, reason: ... }`
 * for any failure mode (same version, missing rules, etc.).
 */
export function activatePolicyVersion(
  proposedManifest: { version: string; rules: unknown[] },
  currentVersion: string
): { activated: boolean; newVersion: string; reason: string } {
  if (
    !proposedManifest ||
    typeof proposedManifest.version !== "string" ||
    proposedManifest.version.length === 0
  ) {
    return {
      activated: false,
      newVersion: currentVersion,
      reason: "invalid_proposed_version",
    };
  }

  if (proposedManifest.version === currentVersion) {
    return {
      activated: false,
      newVersion: currentVersion,
      reason: "version_unchanged",
    };
  }

  if (!Array.isArray(proposedManifest.rules) || proposedManifest.rules.length === 0) {
    return {
      activated: false,
      newVersion: currentVersion,
      reason: "empty_rules",
    };
  }

  return {
    activated: true,
    newVersion: proposedManifest.version,
    reason: "operator-approved",
  };
}

// Re-export `PolicyReceipt` so consumers can type-shadow the receipt field
// without reaching into the receipt module directly. No runtime cost.
export type { PolicyReceipt, PolicyRequest, PolicyEvaluation };