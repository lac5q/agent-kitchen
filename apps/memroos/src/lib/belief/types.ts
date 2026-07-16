/**
 * Phase 122: belief promotion pipeline (BELIEF-PROMO-01..08).
 *
 * Re-exports BeliefStage from recollection-policy so the rest of the
 * codebase has a single source of truth, then defines the deterministic
 * check primitives used by the promotion pipeline.
 *
 * Hard rule: NO LLM in this phase. All checks must be deterministic and
 * reproducible from the candidate row + raw_artifacts alone.
 */
export type { BeliefStage } from "../recollection-policy";

import type { BeliefStage } from "../recollection-policy";

/**
 * Category of a claim. High-stakes categories (configured in config.ts)
 * ALWAYS route through human review. Unknown / unconfigured sensitive
 * labels fail closed (also route to review).
 */
export type ClaimCategory =
  | "pricing"
  | "product_capability"
  | "legal_compliance"
  | "personal_data"
  | "operational"
  | "engineering"
  | "unclassified";

/**
 * A single deterministic promotion check. Evidence records the inputs that
 * caused the pass/fail verdict -- NOT the candidate content. Content must
 * never appear in receipts.
 */
export interface PromotionCheck {
  name:
    | "provenance"
    | "freshness"
    | "policy"
    | "conflict"
    | "dedupe"
    | "ontology";
  pass: boolean;
  evidence: Record<string, unknown>;
}

/** All five checks run during a promotion attempt. */
export type PromotionChecks = PromotionCheck[];

/**
 * AdmissionDecision is the gate output. Three forms:
 *   - admitted: silver -> gold permitted. Receipt row written in same tx.
 *   - denied:   a check failed; no gold mutation, denial receipt recorded.
 *   - queued_for_review: high-stakes category or unlisted sensitive label;
 *     candidate stays silver until an operator resolves the review item.
 *
 * All three branches write a hash-chained belief_promotion_decisions row.
 */
export type AdmissionDecision =
  | { kind: "admitted"; decisionId: string; receipt: PromotionReceiptSummary }
  | {
      kind: "denied";
      reason: string;
      failedCheck: PromotionCheck["name"];
      decisionId: string;
      receipt: PromotionReceiptSummary;
    }
  | {
      kind: "queued_for_review";
      reason: "high_stakes_category" | "unlisted_sensitive_label";
      category: ClaimCategory;
      queueId: string;
      decisionId: string;
      receipt: PromotionReceiptSummary;
    };

/**
 * Public, content-free summary of the promotion decision. Returned to
 * callers and surfaced in API responses. Receipt metadata stores only
 * ids, hashes, and the check verdict -- never the candidate content.
 */
export interface PromotionReceiptSummary {
  id: string;
  candidateId: string;
  tenantId: string;
  category: ClaimCategory;
  fromStage: BeliefStage;
  toStage: BeliefStage;
  decisionType:
    | "promoted"
    | "demoted"
    | "queued_for_review"
    | "review_approved"
    | "review_rejected"
    | "admission_denied";
  actorId: string | null;
  actorRole: string;
  previousEntryHash: string | null;
  entryHash: string;
  createdAt: string;
  ontology?: {
    ontologyId: string;
    ontologyVersion: string;
    ontologyContentHash: string;
    namespace: string;
    canonicalId: string;
    aliasMigrationPath: unknown[];
    sourceId: string;
    sourceHash: string;
    derivativeId: string;
    /** ONTO-06: typed ontology type (e.g. claim). */
    ontologyType?: string;
    /** ONTO-06: optional subject type (e.g. organization / Account). */
    aboutType?: string;
    /** ONTO-06: belief stage mirrored onto the receipt when known. */
    beliefStage?: BeliefStage | string;
  };
}
