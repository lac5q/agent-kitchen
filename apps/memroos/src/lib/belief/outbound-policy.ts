/**
 * Phase 123: gold-only outbound policy (BELIEF-04).
 *
 * Filters claims leaving the operator's trust boundary so that:
 *   - gold claims pass through as-is (they are operational truth)
 *   - silver claims pass through WITH a deterministic inline caveat
 *     when the gateway is in permissive mode, otherwise they are dropped
 *     (only gold goes outbound)
 *   - bronze claims are dropped from the default outbound claim stream and
 *     only emitted when the caller has explicitly opted into citation mode
 *
 * Receipts (the audit/telemetry payload) expose claimHash + stage + action
 * + reason only -- the raw claim content is NEVER duplicated into a receipt.
 * The FilteredClaim itself carries the content because that IS the outbound
 * payload; that boundary is enforced by typing, not by stripping.
 *
 * Hard rules (mirror the rest of Phase 122/123):
 *   - No LLM calls; caveat is a static, env-overridable string.
 *   - No raw content in any receipt field.
 *   - Deterministic: identical inputs -> identical outputs.
 *   - The BeliefStage type is reused from recollection-policy; do NOT
 *     redefine the stage enum here.
 */
import crypto from "crypto";

import type { BeliefStage } from "../recollection-policy";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OutboundPolicy {
  /** Default true. When true, only gold claims are emitted (silver dropped). */
  goldOnly: boolean;
  /** Caveat string appended to silver claims when goldOnly is false. */
  silverCaveat: string;
  /** Default true. When true, bronze claims are dropped unless citationMode is on. */
  bronzeAsCitationOnly: boolean;
}

/** A raw claim candidate leaving the trust boundary. Stage is REQUIRED. */
export interface Claim {
  stage: BeliefStage;
  content: string;
  /** Stable identifier for callers; not part of the receipt surface. */
  id?: string;
  /** ONTO-06: ontology type of this claim (e.g. "claim"). */
  ontologyType?: string;
  /** ONTO-06: subject type the claim is about (e.g. "organization" / Account). */
  aboutType?: string;
}

/**
 * Discriminated union of what actually leaves the system after filtering.
 * bronze-shaped carries `citationOnly: true` so downstream rendering can
 * distinguish "evidence reference" from "claim with a caveat".
 */
export type FilteredClaim =
  | { stage: "gold_operational_truth"; claim: string; caveat: null }
  | { stage: "silver_candidate_claim"; claim: string; caveat: string }
  | { stage: "bronze_raw_source"; claim: string; citationOnly: true };

/**
 * Audit/telemetry surface. NEVER carries raw claim content -- only the
 * sha256 hash of the content. Operations must rely on this contract to
 * keep PII out of telemetry pipelines.
 */
export interface OutboundReceipt {
  claimHash: string;
  stage: BeliefStage;
  action: "emitted" | "caveated" | "dropped";
  reason: string;
  /** ONTO-06: typed ontology coordinates ("gold Claim about Account"). */
  ontologyType?: string;
  aboutType?: string;
}

export interface FilterOutboundOptions {
  /** When true, bronze passes through as citationOnly even if policy says otherwise. */
  citationMode?: boolean;
}

export interface OutboundFilterResult {
  emitted: FilteredClaim[];
  dropped: Claim[];
  receipts: OutboundReceipt[];
}

// ---------------------------------------------------------------------------
// Constants + env loading
// ---------------------------------------------------------------------------

export const DEFAULT_SILVER_CAVEAT = "[unverified claim — pending review]";

export const BELIEF_OUTBOUND_ENV_KEYS = {
  goldOnly: "BELIEF_OUTBOUND_GOLD_ONLY",
  silverCaveat: "BELIEF_OUTBOUND_SILVER_CAVEAT",
  bronzeAsCitationOnly: "BELIEF_OUTBOUND_BRONZE_CITATION_ONLY",
} as const;

const KNOWN_FALSY_VALUES = new Set(["0", "false", "no", "off"]);
const KNOWN_TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (KNOWN_TRUTHY_VALUES.has(normalized)) return true;
  if (KNOWN_FALSY_VALUES.has(normalized)) return false;
  return fallback;
}

export function loadOutboundPolicy(
  env: Record<string, string | undefined> = process.env
): OutboundPolicy {
  return {
    goldOnly: parseBool(env[BELIEF_OUTBOUND_ENV_KEYS.goldOnly], true),
    silverCaveat:
      env[BELIEF_OUTBOUND_ENV_KEYS.silverCaveat]?.trim() ||
      DEFAULT_SILVER_CAVEAT,
    bronzeAsCitationOnly: parseBool(
      env[BELIEF_OUTBOUND_ENV_KEYS.bronzeAsCitationOnly],
      true
    ),
  };
}

export const DEFAULT_OUTBOUND_POLICY: OutboundPolicy = Object.freeze({
  goldOnly: true,
  silverCaveat: DEFAULT_SILVER_CAVEAT,
  bronzeAsCitationOnly: true,
}) as OutboundPolicy;

// ---------------------------------------------------------------------------
// Hash helper -- only place raw content meets sha256 before becoming a receipt
// ---------------------------------------------------------------------------

function claimHashOf(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Core filter
// ---------------------------------------------------------------------------

export function filterOutboundClaims(
  claims: ReadonlyArray<Claim>,
  policy: OutboundPolicy,
  options: FilterOutboundOptions = {}
): OutboundFilterResult {
  const citationMode = options.citationMode === true;
  const emitted: FilteredClaim[] = [];
  const dropped: Claim[] = [];
  const receipts: OutboundReceipt[] = [];

  for (const claim of claims) {
    const claimHash = claimHashOf(claim.content);
    const ontologyFields = {
      ...(claim.ontologyType ? { ontologyType: claim.ontologyType } : {}),
      ...(claim.aboutType ? { aboutType: claim.aboutType } : {}),
    };

    switch (claim.stage) {
      case "gold_operational_truth": {
        emitted.push({ stage: claim.stage, claim: claim.content, caveat: null });
        receipts.push({
          claimHash,
          stage: claim.stage,
          action: "emitted",
          reason: "gold passes through as operational truth",
          ...ontologyFields,
        });
        break;
      }
      case "silver_candidate_claim": {
        if (policy.goldOnly) {
          dropped.push(claim);
          receipts.push({
            claimHash,
            stage: claim.stage,
            action: "dropped",
            reason: "silver dropped because goldOnly=true",
            ...ontologyFields,
          });
        } else {
          emitted.push({
            stage: claim.stage,
            claim: claim.content,
            caveat: policy.silverCaveat,
          });
          receipts.push({
            claimHash,
            stage: claim.stage,
            action: "caveated",
            reason: "silver emitted with deterministic caveat",
            ...ontologyFields,
          });
        }
        break;
      }
      case "bronze_raw_source": {
        const allowCitation = citationMode || !policy.bronzeAsCitationOnly;
        if (allowCitation) {
          emitted.push({
            stage: claim.stage,
            claim: claim.content,
            citationOnly: true,
          });
          receipts.push({
            claimHash,
            stage: claim.stage,
            action: "emitted",
            reason: citationMode
              ? "bronze emitted as citation only (citationMode=true)"
              : "bronze emitted as citation only (policy.bronzeAsCitationOnly=false)",
            ...ontologyFields,
          });
        } else {
          dropped.push(claim);
          receipts.push({
            claimHash,
            stage: claim.stage,
            action: "dropped",
            reason: "bronze dropped (citationOnly=true; not in citation mode)",
            ...ontologyFields,
          });
        }
        break;
      }
    }
  }

  return { emitted, dropped, receipts };
}
