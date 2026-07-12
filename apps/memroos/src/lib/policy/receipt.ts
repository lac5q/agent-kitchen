/**
 * Phase 128 (POLGOV-02): Policy decision receipts.
 *
 * Wraps the unified audit log with a typed, engine-versioned record of every
 * decision returned by `evaluatePolicy`. Receipts are:
 *   - safe to expose (no payload bodies / withheld content)
 *   - versioned against `manifest.json`
 *   - best-effort: a receipt write failure must NEVER change or block a decision
 *
 * `emitPolicyReceipt` therefore wraps the audit write in try/catch and swallows
 * any error. This preserves the WRAP-NOT-REWRITE invariant: decision outcomes
 * remain byte-identical to the pre-engine call paths.
 */

import type Database from "better-sqlite3";

import {
  AUDIT_EVENT_TYPES,
  ENTITY_TYPES,
  type ActorRole,
} from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";

/**
 * Domains the policy engine can evaluate. Keep in sync with `manifest.json`.
 */
export type PolicyDomain = "memory-use" | "capability" | "knowledge";

/**
 * Possible decision outcomes. The strings are stable contract values; the
 * MEMSEC-08 regression corpus asserts byte-for-byte equality against them.
 */
export type PolicyOutcome = "allow" | "deny" | "redact" | "review-required";

/**
 * Audit actor role limited to the `audit_entries.actor_role` enum
 * (admin | operator | reviewer | system). Higher-fidelity roles from the
 * request layer (agent / anonymous) collapse to "system" at the audit
 * boundary.
 */
export type PolicyAuditActorRole = ActorRole;

/**
 * A versioned, audit-shaped record of a single policy decision.
 *
 * `reason` MUST be a SAFE short code (e.g. "sealed_content",
 * "capability_denied", "knowledge_policy_delegated") — never a withheld
 * payload, scrubbed content body, or any sensitive data extracted from the
 * evaluated request. `detail` may only carry ids, labels, capability codes,
 * and counts — never content.
 */
export interface PolicyReceipt {
  policyVersion: string;
  domain: PolicyDomain;
  action: string;
  ruleMatched: string;
  outcome: PolicyOutcome;
  reason: string;
  detail?: Record<string, unknown>;
  actorId: string;
  actorRole: PolicyAuditActorRole;
  tenantId: string;
  createdAt: string;
  ontology?: {
    ontologyId: string;
    ontologyVersion: string;
    ontologyContentHash: string;
    namespace: string;
    canonicalId: string;
    aliasMigrationPath: unknown[];
  };
}

/**
 * Persist a policy receipt to `audit_entries`. Best-effort: any throw from
 * the underlying write is caught and discarded so a receipt failure cannot
 * alter a decision outcome.
 *
 * Always returns synchronously. Audit row layout:
 *   event_type    = AUDIT_EVENT_TYPES.POLICY_DECISION
 *   entity_type   = ENTITY_TYPES.POLICY_DECISION
 *   entity_id     = `policy_decision:<domain>:<action>`
 *   actor_id      = receipt.actorId
 *   actor_role    = receipt.actorRole
 *   reason        = receipt.reason
 *   metadata_json = JSON { policyVersion, domain, action, ruleMatched,
 *                          outcome, reason, detail }
 *   tenant_id     = receipt.tenantId
 */
export function emitPolicyReceipt(
  db: Database.Database,
  receipt: PolicyReceipt
): void {
  try {
    const entityId = `policy_decision:${receipt.domain}:${receipt.action}`;
    const metadata: Record<string, unknown> = {
      policyVersion: receipt.policyVersion,
      domain: receipt.domain,
      action: receipt.action,
      ruleMatched: receipt.ruleMatched,
      outcome: receipt.outcome,
      reason: receipt.reason,
      detail: receipt.detail ?? {},
      ontology: receipt.ontology ?? null,
    };

    writeAuditEntry(
      {
        tenant_id: receipt.tenantId,
        actor_id: receipt.actorId,
        actor_role: receipt.actorRole,
        event_type: AUDIT_EVENT_TYPES.POLICY_DECISION,
        entity_type: ENTITY_TYPES.POLICY_DECISION,
        entity_id: entityId,
        reason: receipt.reason,
        metadata_json: metadata,
        created_at: receipt.createdAt,
      },
      db
    );
  } catch {
    // Best-effort: a receipt write failure MUST NOT change a decision outcome.
    // Swallow silently. Callers can correlate receipts by re-reading audit_entries
    // with event_type = AUDIT_EVENT_TYPES.POLICY_DECISION.
  }
}

/** Ontology-sensitive callers use this strict variant. It intentionally
 * propagates persistence failures so they cannot continue without a receipt. */
export function emitRequiredPolicyReceipt(
  db: Database.Database,
  receipt: PolicyReceipt
): void {
  const entityId = `policy_decision:${receipt.domain}:${receipt.action}`;
  writeAuditEntry(
    {
      tenant_id: receipt.tenantId,
      actor_id: receipt.actorId,
      actor_role: receipt.actorRole,
      event_type: AUDIT_EVENT_TYPES.POLICY_DECISION,
      entity_type: ENTITY_TYPES.POLICY_DECISION,
      entity_id: entityId,
      reason: receipt.reason,
      metadata_json: {
        policyVersion: receipt.policyVersion,
        domain: receipt.domain,
        action: receipt.action,
        ruleMatched: receipt.ruleMatched,
        outcome: receipt.outcome,
        reason: receipt.reason,
        detail: receipt.detail ?? {},
        ontology: receipt.ontology ?? null,
      },
      created_at: receipt.createdAt,
    },
    db
  );
}
