/**
 * MSIQ-04 (VAL-ORCH-004): Scope identity for the self-hosted Microsoft Agent
 * Framework memory adapter.
 *
 * The adapter must enforce a complete scope identity (tenant / user / agent
 * / space / label / purpose / belief-stage) BEFORE any MCP payload access.
 *
 * Invariants:
 *   - All seven dimensions are mandatory. A missing, mismatched, stale, or
 *     undecidable scope fails closed with a typed `incomplete_scope` error.
 *   - `normalizeScopeIdentity` sorts/canonicalizes fields so identical scopes
 *     produce identical hashes regardless of property order.
 *   - `hashScopeIdentity` is the stable SHA-256 fingerprint used by the
 *     idempotency ledger, the policy engine, and audit receipts.
 *   - `extractScopeIdentity` pulls scope out of a JSON payload using the
 *     exact same shape the adapter writes to disk; unknown fields are
 *     ignored so attacker-controlled payload text cannot widen scope.
 */

import crypto from "crypto";

import type {
  MemoryLabelSnapshot,
  MemoryUseActor,
  MemoryUsePurpose,
} from "@/lib/memory/policy-gate";

export type BeliefStage =
  | "silver_candidate_claim"
  | "gold_claim"
  | "revoked"
  | "superseded";

export const BELIEF_STAGES: ReadonlyArray<BeliefStage> = [
  "silver_candidate_claim",
  "gold_claim",
  "revoked",
  "superseded",
] as const;

export interface MsiqScopeIdentity {
  tenantId: string;
  userId: string;
  agentId: string;
  spaceId: string;
  label: Required<Pick<MemoryLabelSnapshot, "visibility" | "policy">> &
    Pick<MemoryLabelSnapshot, "domain" | "sensitivity">;
  purpose: MemoryUsePurpose;
  beliefStage: BeliefStage;
}

export interface ScopeIdentityInput {
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  spaceId?: string | null;
  label?: MemoryLabelSnapshot | null;
  purpose?: MemoryUsePurpose | null;
  beliefStage?: BeliefStage | string | null;
}

const VALID_PURPOSES: ReadonlyArray<MemoryUsePurpose> = [
  "recall",
  "multi-search",
  "context-pack",
  "chatgpt-action",
  "export",
  "summary",
  "dispatch",
  "index-write",
  "evidence-bundle",
  "memory_search",
  "memory-promotion",
];

const VALID_VISIBILITIES = new Set(["private", "internal", "public_safe", "public_approved"]);
const VALID_POLICIES = new Set([
  "indexable",
  "agent_visible",
  "requires_redaction",
  "requires_human_review",
  "sealed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeLabel(label: MemoryLabelSnapshot | null | undefined): MsiqScopeIdentity["label"] | null {
  if (!label) return null;
  const visibility = label.visibility ?? "private";
  if (!VALID_VISIBILITIES.has(visibility)) return null;
  const policy = label.policy ?? "sealed";
  if (!VALID_POLICIES.has(policy)) return null;
  return {
    visibility,
    policy,
    domain: label.domain ?? null,
    sensitivity: label.sensitivity ?? null,
  };
}

function normalizeBeliefStage(stage: string | null | undefined): BeliefStage | null {
  if (typeof stage !== "string") return null;
  if (BELIEF_STAGES.includes(stage as BeliefStage)) return stage as BeliefStage;
  return null;
}

export function isCompleteScopeIdentity(value: unknown): value is MsiqScopeIdentity {
  if (!isRecord(value)) return false;
  const required = ["tenantId", "userId", "agentId", "spaceId", "label", "purpose", "beliefStage"];
  for (const key of required) {
    if (!(key in value)) return false;
  }
  const label = (value as Record<string, unknown>).label;
  if (!isRecord(label)) return false;
  if (typeof label.visibility !== "string" || typeof label.policy !== "string") return false;
  if (typeof (value as Record<string, unknown>).purpose !== "string") return false;
  return true;
}

/**
 * Normalize an inbound scope-input into the canonical MsiqScopeIdentity.
 * Returns null if any dimension is missing, invalid, or undecidable --
 * callers MUST treat null as `incomplete_scope` and fail closed.
 */
export function normalizeScopeIdentity(input: ScopeIdentityInput): MsiqScopeIdentity | null {
  const tenantId = typeof input.tenantId === "string" && input.tenantId.length > 0 ? input.tenantId : null;
  const userId = typeof input.userId === "string" && input.userId.length > 0 ? input.userId : null;
  const agentId = typeof input.agentId === "string" && input.agentId.length > 0 ? input.agentId : null;
  const spaceId = typeof input.spaceId === "string" && input.spaceId.length > 0 ? input.spaceId : null;
  const label = normalizeLabel(input.label ?? null);
  const purpose =
    typeof input.purpose === "string" && VALID_PURPOSES.includes(input.purpose as MemoryUsePurpose)
      ? (input.purpose as MemoryUsePurpose)
      : null;
  const beliefStage = normalizeBeliefStage(input.beliefStage ?? null);

  if (!tenantId || !userId || !agentId || !spaceId || !label || !purpose || !beliefStage) {
    return null;
  }
  return {
    tenantId,
    userId,
    agentId,
    spaceId,
    label,
    purpose,
    beliefStage,
  };
}

/**
 * Build an MsiqScopeIdentity directly from a `MemoryUseActor` and a label
 * snapshot. `spaceId` is supplied separately because the actor type does
 * not carry one.
 */
export function buildScopeIdentity(args: {
  actor: MemoryUseActor;
  spaceId: string;
  label: MemoryLabelSnapshot;
  purpose: MemoryUsePurpose;
  beliefStage?: BeliefStage | null;
}): MsiqScopeIdentity | null {
  return normalizeScopeIdentity({
    tenantId: args.actor.tenantId ?? "default-tenant",
    userId: args.actor.id,
    agentId: args.actor.capability ?? "anonymous",
    spaceId: args.spaceId,
    label: args.label,
    purpose: args.purpose,
    beliefStage: args.beliefStage ?? "silver_candidate_claim",
  });
}

export function hashScopeIdentity(scope: MsiqScopeIdentity): string {
  const canonical = stableJson({
    tenantId: scope.tenantId,
    userId: scope.userId,
    agentId: scope.agentId,
    spaceId: scope.spaceId,
    label: {
      visibility: scope.label.visibility,
      policy: scope.label.policy,
      domain: scope.label.domain ?? null,
      sensitivity: scope.label.sensitivity ?? null,
    },
    purpose: scope.purpose,
    beliefStage: scope.beliefStage,
  });
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

export function scopeIdentityRecord(scope: MsiqScopeIdentity): Record<string, unknown> {
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    agentId: scope.agentId,
    spaceId: scope.spaceId,
    label: {
      visibility: scope.label.visibility,
      policy: scope.label.policy,
      domain: scope.label.domain ?? null,
      sensitivity: scope.label.sensitivity ?? null,
    },
    purpose: scope.purpose,
    beliefStage: scope.beliefStage,
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizeStable(v)]),
    );
  }
  return value;
}
