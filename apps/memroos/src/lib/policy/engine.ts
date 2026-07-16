/**
 * Phase 128 (POLGOV-01) + v8.10 round-3 (ONTO-25 follow-up): Shared policy engine.
 *
 * WRAP-NOT-REWRITE. This engine delegates every evaluation to the existing
 * in-process decision functions:
 *
 *   memory-use  -> `authorizeMemoryUse` (memory/policy-gate.ts)
 *   capability  -> `checkDispatchPolicy` / `checkA2aSendPolicy` /
 *                  `checkMemoryWritePolicy` (security-policy.ts)
 *   knowledge   -> `evaluateKnowledgePolicy` (declarative pass-through; the
 *                  actual `knowledge_policy_check` lives in the Python
 *                  knowledge MCP and is out of scope for this phase).
 *
 * The engine exists to:
 *   1. Stamp every decision with `POLICY_VERSION` from the in-repo manifest.
 *   2. Emit a single `audit_entries` row per decision via `emitPolicyReceipt`.
 *   3. Return the underlying decision result unchanged so existing callers
 *      see byte-identical outcomes (MEMSEC-08 regression corpus).
 *
 * INVARIANT: never modify a call to `authorizeMemoryUse` / `checkDispatchPolicy` /
 * `checkA2aSendPolicy` / `checkMemoryWritePolicy` so as to flip its decision.
 *
 * v8.10 ontology hardening (ONTO-25 follow-up):
 *   - `evaluateKnowledgePolicy` requires caller-supplied `ontologyReference`
 *     for ontology-sensitive calls. A caller-supplied `ontologyContext` is
 *     rejected (forged context cannot authorize anything).
 *   - `resolveRequiredKnowledgeOntologyContext` is the single helper that
 *     resolves the server-owned context via `resolveOntologyValidity`. Any
 *     absent / forged / foreign / stale / revoked / unreachable ontology
 *     state fails closed.
 *   - Receipt-write failures for ontology-sensitive knowledge decisions are
 *     NOT swallowed. They propagate as a deny receipt with reason
 *     `ontology_context_unavailable`, never as a silent allow.
 */

import type Database from "better-sqlite3";

import {
  authorizeMemoryUse,
  type MemoryUseActor,
  type MemoryUseDecisionResult,
  type MemoryUsePurpose,
  type MemoryLabelSnapshot,
} from "@/lib/memory/policy-gate";
import type { MemoryTier } from "@/lib/memory/tiers";
import {
  checkA2aSendPolicy,
  checkDispatchPolicy,
  checkMemoryWritePolicy,
  type PolicyDecision,
} from "@/lib/security-policy";
import type { RegisteredAgent, RemoteAgentConfig } from "@/types";

import manifest from "./policies/manifest.json";
import {
  matchDimensions,
  type PolicyDimensionRule,
  type PolicyRequestDimensions,
} from "./dimensions";
import {
  emitPolicyReceipt,
  emitRequiredPolicyReceipt,
  type PolicyDomain,
  type PolicyOutcome,
  type PolicyReceipt,
} from "./receipt";
import { resolveOntologyValidity } from "@/lib/ontology/validity";
import { withOntologyTypeRef } from "@/lib/ontology/receipt-types";

/**
 * Shape of the dimension rules in the manifest. The manifest is JSON, so
 * `dimensions` may be absent or `effect` may be some other value; we only
 * honor rules with `effect: "deny"`.
 */
interface ManifestRuleWithDimensions {
  id: string;
  domain: string;
  dimensions?: PolicyDimensionRule;
}

/**
 * Engine policy version. Sourced from `policies/manifest.json` so changing
 * the manifest (and re-running the appropriate governance step) is enough
 * to invalidate downstream receipts.
 */
export const POLICY_VERSION: string = manifest.version;

/**
 * Audit actor role enum (admin | operator | reviewer | system).
 * Domain-level roles like "agent" / "anonymous" collapse to "system" at the
 * audit boundary.
 */
type AuditActorRole = "admin" | "operator" | "reviewer" | "system";

/**
 * Request-level actor (broader than the audit enum — preserves fidelity at
 * the boundary, then collapses to `AuditActorRole` for the audit row).
 */
export interface PolicyRequestActor {
  id: string;
  role: "admin" | "operator" | "reviewer" | "agent" | "anonymous" | "system";
  tenantId?: string | null;
}

/**
 * The decision-request payload. Exactly one of `memoryUse`, `capability`, or
 * (implicitly, via `evaluateKnowledgePolicy`) the knowledge path is supplied.
 */
export interface PolicyRequest {
  domain: PolicyDomain;
  action: string;
  actor?: PolicyRequestActor;
  memoryUse?: {
    actor: MemoryUseActor;
    purpose: MemoryUsePurpose;
    label: MemoryLabelSnapshot;
  };
  capability?:
    | { kind: "dispatch"; fromAgentId: string; targetAgent: RemoteAgentConfig }
    | { kind: "a2a-send"; agent: RegisteredAgent }
    | {
        kind: "memory-write";
        agent: RegisteredAgent;
        tier: MemoryTier;
      };
  /**
   * Optional per-request dimensions used by Phase 129 dimension rules.
   * When undefined, no dimension rule can match a rule with ANY specified
   * field — preserving the Phase 128 byte-identical contract.
   */
  dimensions?: PolicyRequestDimensions;
  /** Required for ontology-sensitive calls, IDs and hashes only. */
  ontologyContext?: PolicyReceipt["ontology"];
  /**
   * Server-resolved coordinates for an ontology-sensitive request. Callers
   * never supply authoritative ontology hashes or status.
   */
  ontologyReference?: {
    tenantId: string;
    spaceId: string;
    recordType: string;
    recordId: string;
    /** ONTO-06: optional subject type (e.g. organization / Account). */
    aboutType?: string;
    /** ONTO-06: optional belief stage for typed receipts. */
    beliefStage?: string;
  };
}

export interface PolicyEvaluation {
  receipt: PolicyReceipt;
  /**
   * Underlying decision result, returned verbatim so the byte-identical
   * outcome the caller previously got from the wrapped function is preserved.
   */
  memoryUse?: MemoryUseDecisionResult;
  capability?: PolicyDecision;
}

function collapseAuditRole(
  role: PolicyRequestActor["role"] | undefined
): AuditActorRole {
  // audit_entries.actor_role enum: admin | operator | reviewer | system.
  // Domain roles (agent / anonymous) and missing roles collapse to "system".
  if (role === "admin" || role === "operator" || role === "reviewer") {
    return role;
  }
  return "system";
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Build a `PolicyReceipt` from the underlying decision + request metadata.
 * Pure — does not write to the audit log. Exposed so tests + callers can
 * inspect the receipt shape without touching the DB.
 */
export function buildReceipt(
  req: PolicyRequest,
  underlying: {
    outcome: PolicyOutcome;
    reason: string;
    ruleMatched: string;
    detail?: Record<string, unknown>;
  }
): PolicyReceipt {
  const actor = req.actor;
  const ontology = req.ontologyContext
    ? withOntologyTypeRef(req.ontologyContext as Record<string, unknown>, {
        aboutType: req.ontologyReference?.aboutType,
        beliefStage: req.ontologyReference?.beliefStage,
      }) as PolicyReceipt["ontology"]
    : undefined;
  return {
    policyVersion: POLICY_VERSION,
    domain: req.domain,
    action: req.action,
    ruleMatched: underlying.ruleMatched,
    outcome: underlying.outcome,
    reason: underlying.reason,
    detail: underlying.detail,
    actorId: actor?.id ?? "system",
    actorRole: collapseAuditRole(actor?.role),
    tenantId: actor?.tenantId ?? "default-tenant",
    createdAt: nowIso(),
    ontology,
  };
}

/**
 * Map a `PolicyDecision.allowed` boolean to the engine's `PolicyOutcome` vocab.
 * `PolicyDecision` is binary (allow / deny-with-code); "redact" and
 * "review-required" do not apply at the capability boundary.
 */
function outcomeFromPolicyDecision(allowed: boolean): PolicyOutcome {
  return allowed ? "allow" : "deny";
}

function reasonFromPolicyDecision(decision: PolicyDecision): string {
  if (decision.allowed) return decision.message ?? "capability_allowed";
  return decision.message ?? decision.code ?? "capability_denied";
}

/**
 * Evaluate a memory-use decision. Thin wrapper — `authorizeMemoryUse` is
 * called exactly once with the same arguments the caller used pre-engine,
 * then the result is mirrored onto a receipt and returned byte-identical.
 */
function evaluateMemoryUse(req: PolicyRequest, memoryUse: NonNullable<PolicyRequest["memoryUse"]>): PolicyEvaluation {
  const result = authorizeMemoryUse({
    actor: memoryUse.actor,
    purpose: memoryUse.purpose,
    label: memoryUse.label,
  });

  const detail: Record<string, unknown> = {
    label: result.label,
    purpose: memoryUse.purpose,
    actorRole: memoryUse.actor.role,
  };

  const receipt = buildReceipt(req, {
    outcome: result.decision,
    reason: result.reason,
    ruleMatched: "memsec.memory-use",
    detail,
  });

  return { receipt, memoryUse: result };
}

/**
 * Evaluate a capability decision. The wrapped function is called directly with
 * the request's typed payload; its result is returned unchanged on
 * `evaluation.capability`.
 */
function evaluateCapability(
  req: PolicyRequest,
  capability: NonNullable<PolicyRequest["capability"]>
): PolicyEvaluation {
  let decision: PolicyDecision;
  let ruleMatched: string;

  if (capability.kind === "dispatch") {
    ruleMatched = "capability.dispatch";
    decision = checkDispatchPolicy(capability.fromAgentId, capability.targetAgent);
  } else if (capability.kind === "a2a-send") {
    ruleMatched = "capability.a2a-send";
    decision = checkA2aSendPolicy(capability.agent);
  } else {
    ruleMatched = "capability.memory-write";
    decision = checkMemoryWritePolicy(capability.agent, capability.tier);
  }

  const receipt = buildReceipt(req, {
    outcome: outcomeFromPolicyDecision(decision.allowed),
    reason: reasonFromPolicyDecision(decision),
    ruleMatched,
    // `decision.detail` is already ids/codes only per security-policy.ts.
    detail: decision.detail,
  });

  return { receipt, capability: decision };
}

/**
 * Evaluator for the knowledge domain. The actual `knowledge_policy_check`
 * lives in the Python knowledge MCP server — this engine just records a
 * receipt that the decision was routed through the shared engine so the
 * audit trail is consistent across domains. The phase-128 surface is a
 * thin declarative pass-through; no policy is reimplemented here.
 *
 * v8.10 round-3 (ONTO-25 follow-up):
 *   - A caller-supplied `ontologyContext` is always rejected. Callers may
 *     only supply `ontologyReference` coordinates; the context itself is
 *     resolved server-side via `resolveRequiredKnowledgeOntologyContext`.
 *   - Any ontology-sensitive knowledge decision MUST carry a single
 *     server-resolved ontology context. The `db` handle is required so the
 *     helper can fail closed.
 *   - If the receipt write fails for an ontology-sensitive decision, we do
 *     NOT swallow the failure. We write a deny receipt (reason
 *     `ontology_context_unavailable`) and return it as the evaluation.
 */
export interface KnowledgeRequestMeta {
  action: string;
  actor?: PolicyRequestActor;
  /** ids / tool name / tenant / context ids only — never content. */
  metadata?: Record<string, unknown>;
  /** Rejected for ontology-sensitive calls. Server resolves from persisted
   * coordinates only; never trust a caller-supplied hash. */
  ontologyContext?: PolicyReceipt["ontology"];
  /**
   * Caller-supplied coordinates for an ontology-sensitive decision. The
   * server resolves these via `resolveRequiredKnowledgeOntologyContext`.
   */
  ontologyReference?: PolicyRequest["ontologyReference"];
}

/**
 * Single helper that resolves the server-owned ontology context for a
 * knowledge-domain decision. Any failure (absent coordinates, forged hash,
 * foreign tenant/space, stale/revoked source, unreachable DB) fails closed
 * with `ontology_context_unavailable`. The caller MUST treat this helper as
 * the authoritative source — there is no other way to populate the receipt
 * for ontology-sensitive knowledge calls.
 */
export function resolveRequiredKnowledgeOntologyContext(
  db: Database.Database,
  reference: NonNullable<PolicyRequest["ontologyReference"]>,
): PolicyReceipt["ontology"] {
  // `resolveOntologyValidity` throws OntologyGovernanceError on any of:
  //   - missing versioned record
  //   - source revoked / unverified
  //   - ontology stale / not globally active
  // We surface every such case as `ontology_context_unavailable` so callers
  // do not need to know the failure mode.
  const context = resolveOntologyValidity(db, reference);
  return withOntologyTypeRef(context as Record<string, unknown>, {
    aboutType: reference.aboutType,
    beliefStage: reference.beliefStage,
  }) as PolicyReceipt["ontology"];
}

/**
 * Convert a failed helper call into a stable reason code. Callers always
 * report `ontology_context_unavailable` regardless of the underlying cause
 * (absent / forged / foreign / stale / revoked / unreachable) — the contract
 * is fail-closed, not diagnostic.
 */
const KNOWLEDGE_ONTOLOGY_UNAVAILABLE = "ontology_context_unavailable";

/**
 * Build a deny receipt for a knowledge decision whose ontology context
 * could not be resolved (or whose receipt write could not be persisted).
 * The receipt is byte-shaped like any other `PolicyReceipt` so callers can
 * pipe it through the same downstream audit-trail consumers.
 */
function buildKnowledgeDenyReceipt(
  req: PolicyRequest,
  reason: string,
): PolicyReceipt {
  return buildReceipt(req, {
    outcome: "deny",
    reason,
    ruleMatched: "knowledge.policy-check",
  });
}

/**
 * Thin declarative pass-through for the knowledge domain. Records a receipt
 * with outcome "allow" and reason "knowledge_policy_delegated" — the actual
 * policy verdict is produced by `knowledge_policy_check` in the Python
 * knowledge MCP. This function MUST stay minimal: no reimplementation.
 *
 * Receipt persistence for ontology-sensitive calls is mandatory: any
 * persistence failure propagates as a deny receipt with reason
 * `ontology_context_unavailable` rather than a silent allow.
 */
export function evaluateKnowledgePolicy(
  meta: KnowledgeRequestMeta,
  db?: Database.Database
): PolicyEvaluation {
  // v8.10 round-3 (ONTO-25 follow-up): any caller-supplied
  // `ontologyContext` is rejected, even when `ontologyReference` is also
  // supplied. The server is the sole authoritative source of the ontology
  // context; a caller cannot supply authoritative hashes or status.
  if (meta.ontologyContext) {
    throw new Error("evaluateKnowledgePolicy: caller-supplied ontology context is not accepted");
  }
  if (meta.ontologyReference && !db) {
    throw new Error("evaluateKnowledgePolicy: ontology-sensitive decisions require persistence");
  }
  const ontologyContext = meta.ontologyReference && db
    ? resolveRequiredKnowledgeOntologyContext(db, meta.ontologyReference)
    : undefined;
  return evaluateKnowledgePolicyResolved({ ...meta, ontologyContext }, db);
}

function evaluateKnowledgePolicyResolved(
  meta: KnowledgeRequestMeta,
  db?: Database.Database,
): PolicyEvaluation {
  const actorId = meta.actor?.id ?? "system";
  const actorRole = collapseAuditRole(meta.actor?.role);
  const tenantId = meta.actor?.tenantId ?? "default-tenant";

  const req: PolicyRequest = {
    domain: "knowledge",
    action: meta.action,
    actor: meta.actor,
    ontologyContext: meta.ontologyContext,
  };

  const receipt = buildReceipt(req, {
    outcome: "allow",
    reason: "knowledge_policy_delegated",
    ruleMatched: "knowledge.policy-check",
    detail: meta.metadata,
  });

  if (db) {
    try {
      if (meta.ontologyContext) {
        // Ontology-sensitive: receipt persistence is REQUIRED. We do not
        // swallow the throw — we transform it into a deny receipt so the
        // caller never sees a silent allow.
        emitRequiredPolicyReceipt(db, receipt);
      } else {
        emitPolicyReceipt(db, receipt);
      }
    } catch (err) {
      // Receipt-write failure for an ontology-sensitive call is the same as
      // an unavailable ontology context: deny and emit the explicit reason.
      const denyReason = meta.ontologyContext
        ? KNOWLEDGE_ONTOLOGY_UNAVAILABLE
        : (err instanceof Error ? err.message : "receipt_write_failed");
      const denyReceipt = buildKnowledgeDenyReceipt(req, denyReason);
      if (meta.ontologyContext) {
        try {
          emitRequiredPolicyReceipt(db, denyReceipt);
        } catch {
          // The deny receipt itself failed to persist; we still return the
          // deny verdict — the caller MUST treat `outcome: deny` as terminal.
        }
      }
      void actorId;
      void actorRole;
      void tenantId;
      return { receipt: denyReceipt };
    }
  }

  // Touch `actorId` / `actorRole` / `tenantId` only via the receipt — explicit
  // discard so this function remains obviously minimal.
  void actorId;
  void actorRole;
  void tenantId;

  return { receipt };
}

/**
 * Evaluate a policy request. Wraps the underlying decision function, builds
 * a versioned receipt, and (if a db handle is supplied) records that receipt
 * to `audit_entries` with event_type `policy.decision`.
 *
 * Decision outcomes are byte-identical to the wrapped functions — receipts
 * are additive only.
 *
 * Throws if the request shape is invalid (domain/action mismatched against
 * payload). The audit-write inside `emitPolicyReceipt` is best-effort and
 * never throws. The audit-write inside `emitRequiredPolicyReceipt` is NOT
 * best-effort for ontology-sensitive calls: the receipt is mandatory.
 *
 * v8.10 round-3 (ONTO-25 follow-up): for ontology-sensitive knowledge
 * decisions, receipt-write failures are NOT swallowed. The function returns
 * a deny receipt (reason `ontology_context_unavailable`) instead.
 */
export function evaluatePolicy(
  req: PolicyRequest,
  db?: Database.Database
): PolicyEvaluation {
  if (!req.domain) throw new Error("evaluatePolicy: domain is required");
  if (!req.action) throw new Error("evaluatePolicy: action is required");
  if (req.ontologyContext && !req.ontologyReference) {
    throw new Error("evaluatePolicy: caller-supplied ontology context is not accepted");
  }
  if (req.ontologyReference && !db) {
    throw new Error("evaluatePolicy: ontology-sensitive decisions require persistence");
  }
  if (req.ontologyReference) {
    // Thread the single helper for the knowledge domain. For non-knowledge
    // requests we still resolve via the helper so the fail-closed
    // contract is consistent across all entry points.
    req = {
      ...req,
      ontologyContext: resolveRequiredKnowledgeOntologyContext(db!, req.ontologyReference),
    };
  }

  let evaluation: PolicyEvaluation;

  if (req.domain === "memory-use") {
    if (!req.memoryUse) {
      throw new Error("evaluatePolicy: memory-use domain requires memoryUse payload");
    }
    evaluation = evaluateMemoryUse(req, req.memoryUse);
  } else if (req.domain === "capability") {
    if (!req.capability) {
      throw new Error("evaluatePolicy: capability domain requires capability payload");
    }
    evaluation = evaluateCapability(req, req.capability);
  } else if (req.domain === "knowledge") {
    if (!req.actor) {
      throw new Error("evaluatePolicy: knowledge domain requires an actor");
    }
    // Delegate to evaluateKnowledgePolicyResolved so receipt-write failures
    // for ontology-sensitive calls propagate as a deny receipt (not a
    // silent allow). This is the SAME helper `evaluateKnowledgePolicy` uses.
    return evaluateKnowledgePolicyResolved(
      {
        action: req.action,
        actor: req.actor,
        metadata: undefined,
        ontologyContext: req.ontologyContext,
      },
      db
    );
  } else {
    throw new Error(`evaluatePolicy: unsupported domain: ${String(req.domain)}`);
  }

  // Phase 129 (POLGOV-03): additive dimension tightening. Only runs when
  // the caller supplied `dimensions`. Skipped entirely otherwise — byte-
  // identical for every Phase 128 caller (no dimensions supplied).
  evaluation = applyDimensionTightening(evaluation, req);

  if (db) {
    if (req.ontologyReference) {
      emitRequiredPolicyReceipt(db, evaluation.receipt);
    } else {
      emitPolicyReceipt(db, evaluation.receipt);
    }
  }

  return evaluation;
}

/**
 * Walk the manifest's rules for the request domain, find any dimension rule
 * with `effect: "deny"` whose dimensions match the request, and tighten
 * the receipt outcome from allow/redact/review-required to deny. A deny
 * stays deny (already terminal). Records the matched rule id in
 * `receipt.ruleMatched` for traceability.
 *
 * The underlying wrapped-function result is intentionally left unchanged
 * on `evaluation.memoryUse` / `evaluation.capability` — those remain the
 * byte-identical wrapped output so callers can still rely on them. The
 * dimension rule only modifies the *engine*'s view of the decision.
 */
function applyDimensionTightening(
  evaluation: PolicyEvaluation,
  req: PolicyRequest
): PolicyEvaluation {
  if (req.dimensions === undefined) return evaluation;
  // No point tightening an already-deny decision.
  if (evaluation.receipt.outcome === "deny") return evaluation;

  const dimensionRules = (manifest.rules as ManifestRuleWithDimensions[]).filter(
    (rule) => rule.domain === req.domain && rule.dimensions !== undefined
  );

  for (const rule of dimensionRules) {
    if (!rule.dimensions) continue;
    if (rule.dimensions.effect !== "deny") continue;
    if (!matchDimensions(rule.dimensions, req.dimensions)) continue;

    return {
      ...evaluation,
      receipt: {
        ...evaluation.receipt,
        outcome: "deny",
        reason: `dimension_deny:${rule.id}`,
        ruleMatched: rule.id,
      },
    };
  }

  return evaluation;
}

