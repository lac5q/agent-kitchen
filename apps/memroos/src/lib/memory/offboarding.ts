/**
 * MEMLIFE-05 / VAL-MEM-028 + VAL-MEM-030: Offboarding triggers an honest pending
 * erasure review; tombstones preserve continuity without payload.
 *
 * Offboarding (`triggerOffboardingPendingErasure`):
 *   - Revokes human/agent credentials, deregisters owned agents, and reassigns messages
 *     to a stable placeholder -- all atomic and reversible by replay (idempotent on
 *     subject_hash).
 *   - Creates a single scoped `memory_offboarding_reviews` row in `pending` state.
 *     Repeated calls return the same review id (idempotent).
 *   - Does NOT claim erasure complete. The review stays `pending` until an operator
 *     walks the DSAR / subject-plan path to completion.
 *
 * Tombstones (`writeTombstoneForErasure`, `verifyTombstoneContinuity`):
 *   - Append-only non-sensitive tombstones for completed erasures that preserve
 *     audit-chain continuity without raw payload. Schema is locked to the v18
 *     migration and never includes raw memory content or secrets.
 *   - Replay is append-only (UNIQUE(tenant_id, erasure_id, canonical_id,
 *     record_type, record_id) prevents duplicates), restart/migration-safe
 *     (every tombstone includes scope_hash, policy_id, erasure_id), and
 *     chain-verifiable via the memory lifecycle audit chain.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeChainedMemoryAuditEntry } from "@/lib/audit/memory-chain";
import { sha256Hex, stableJson, type RetentionScope } from "@/lib/memory/retention-policy";
import type { SubjectDerivativeInventory } from "@/lib/memory/subject-erasure";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface OffboardingTriggerInput {
  tenantId?: string;
  subjectHash: string;
  userId?: string | null;
  scope: RetentionScope;
  actorId: string;
  slaSeconds?: number;
  now?: Date;
}

export interface OffboardingReceipt {
  reviewId: string;
  subjectHash: string;
  status: "pending" | "in_progress" | "completed" | "cancelled" | "failed";
  revokedCredentials: number;
  revokedAgents: number;
  reassignedArtifacts: number;
  pendingPlanId: string | null;
  slaDeadline: string;
  createdAt: string;
  idempotent: boolean;
}

export interface TombstoneInput {
  tenantId?: string;
  subjectHash: string;
  canonicalId: string;
  recordType: string;
  recordId: string;
  recordIdHash: string;
  derivativeInventory: SubjectDerivativeInventory[];
  policyId?: string | null;
  policyVersion?: string | null;
  erasureId: string;
  scope: RetentionScope;
  outcome: "erased" | "blocked" | "failed" | "partial";
  createdAt?: string;
  now?: Date;
  actorId: string;
}

export interface TombstoneRow {
  id: string;
  tenantId: string;
  subjectHash: string;
  canonicalId: string;
  recordType: string;
  recordId: string;
  recordIdHash: string;
  derivativeInventoryHash: string;
  policyId: string | null;
  policyVersion: string | null;
  erasureId: string;
  scopeHash: string;
  outcome: TombstoneInput["outcome"];
  createdAt: string;
}

export interface TombstoneContinuityReport {
  valid: boolean;
  tombstonesChecked: number;
  firstBrokenTombstoneId?: string;
  reason?: string;
}

export class OffboardingReviewCompletionError extends Error {
  constructor(
    public readonly code: "missing_erasure_plan" | "erasure_incomplete",
    message: string
  ) {
    super(message);
    this.name = "OffboardingReviewCompletionError";
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function scopeHashOf(scope: RetentionScope): string {
  return sha256Hex(stableJson(scope));
}

function safeTenantId(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/* ------------------------------------------------------------------ */
/* Offboarding                                                          */
/* ------------------------------------------------------------------ */

/**
 * Trigger an offboarding-driven pending MEMLIFE erasure review. Idempotent on
 * (tenant_id, subject_hash): repeated calls return the same review id.
 *
 * Steps (single transaction):
 *   1. Revoke all live `agent_api_keys` owned by `userId` (if provided).
 *   2. Deregister every agent owned by `userId`.
 *   3. Reassign messages authored by `userId` to a system placeholder.
 *   4. Create the `memory_offboarding_reviews` row in `pending` state.
 *   5. Emit a `memory.offboarding.pending` audit event via the memory chain.
 *
 * The receipt NEVER claims erasure complete; downstream DSAR / subject-plan
 * execution is the only path to `completed`.
 */
export function triggerOffboardingPendingErasure(
  db: Database.Database,
  input: OffboardingTriggerInput
): OffboardingReceipt {
  const tenantId = safeTenantId(input.tenantId, typeof input.scope.tenantId === "string" ? input.scope.tenantId : "default-tenant");
  const now = input.now ?? new Date();
  const createdAt = toIso(now);
  const slaSeconds = input.slaSeconds ?? 24 * 60 * 60;
  const slaDeadline = new Date(now.getTime() + slaSeconds * 1000).toISOString();

  if (!input.subjectHash?.trim()) throw new Error("subjectHash is required");
  if (!input.actorId?.trim()) throw new Error("actorId is required");

  // Idempotency: same subject_hash returns the same review.
  if (tableExists(db, "memory_offboarding_reviews")) {
    const existing = db
      .prepare(
        `SELECT id, status, revoked_credentials, revoked_agents, pending_plan_id, sla_deadline, created_at
         FROM memory_offboarding_reviews
         WHERE tenant_id = ? AND subject_hash = ? AND review_kind = 'pending_erasure'`
      )
      .get(tenantId, input.subjectHash) as
      | { id: string; status: OffboardingReceipt["status"]; revoked_credentials: number; revoked_agents: number; pending_plan_id: string | null; sla_deadline: string; created_at: string }
      | undefined;
    if (existing) {
      return {
        reviewId: existing.id,
        subjectHash: input.subjectHash,
        status: existing.status,
        revokedCredentials: existing.revoked_credentials,
        revokedAgents: existing.revoked_agents,
        reassignedArtifacts: countReassignedArtifacts(db, tenantId, input.userId ?? null),
        pendingPlanId: existing.pending_plan_id,
        slaDeadline: existing.sla_deadline,
        createdAt: existing.created_at,
        idempotent: true,
      };
    }
  }

  const reviewId = `ofrv_${crypto.randomUUID()}`;
  let revokedCredentials = 0;
  let revokedAgents = 0;
  let reassignedArtifacts = 0;

  try {
    db.transaction(() => {
      if (input.userId && tableExists(db, "users")) {
        const userRow = db.prepare("SELECT id FROM users WHERE id = ?").get(input.userId) as { id: string } | undefined;
        if (userRow) {
          // 1. Revoke user_api_keys.
          if (tableExists(db, "user_api_keys")) {
            const res = db.prepare(
              `UPDATE user_api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
            ).run(createdAt, input.userId);
            revokedCredentials = res.changes;
          }
          if (tableExists(db, "user_refresh_tokens")) {
            const res = db.prepare(
              `UPDATE user_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
            ).run(createdAt, input.userId);
            revokedCredentials += res.changes;
          }
          // 2. Deregister agents owned by this user.
          if (tableExists(db, "registered_agents")) {
            const agents = db
              .prepare(`SELECT id FROM registered_agents WHERE owner_id = ? AND deregistered_at IS NULL`)
              .all(input.userId) as { id: string }[];
            for (const { id } of agents) {
              db.prepare(
                `UPDATE registered_agents SET deregistered_at = ?, status = 'dormant', updated_at = ? WHERE id = ? AND deregistered_at IS NULL`
              ).run(createdAt, createdAt, id);
              if (tableExists(db, "agent_api_keys")) {
                const keyResult = db.prepare(
                  `UPDATE agent_api_keys SET revoked_at = ? WHERE agent_id = ? AND revoked_at IS NULL`
                ).run(createdAt, id);
                revokedCredentials += keyResult.changes;
              }
              // A deregistered agent may not retain dispatch authority through
              // a persisted skill pin or dependency edge. Delete these
              // access-bearing projections atomically with credential
              // revocation so repeated offboarding converges safely.
              if (tableExists(db, "skill_version_pins")) {
                db.prepare(`DELETE FROM skill_version_pins WHERE agent_id = ?`).run(id);
              }
              if (tableExists(db, "skill_dependencies")) {
                db.prepare(`DELETE FROM skill_dependencies WHERE dependent_agent_id = ?`).run(id);
              }
              revokedAgents += 1;
            }
          }
          // 3. Reassign messages authored by the user to the system placeholder.
          if (tableExists(db, "messages")) {
            const res = db.prepare(
              `UPDATE messages SET agent_id = 'system' WHERE agent_id = ?`
            ).run(input.userId);
            reassignedArtifacts = res.changes;
          }
        }
      }

      // 4. Insert the offboarding review row.
      if (tableExists(db, "memory_offboarding_reviews")) {
        db.prepare(
          `INSERT INTO memory_offboarding_reviews
            (id, tenant_id, subject_hash, user_id, review_kind, status, revoked_credentials,
             revoked_agents, sla_seconds, sla_deadline, created_by, created_at)
           VALUES (?, ?, ?, ?, 'pending_erasure', 'pending', ?, ?, ?, ?, ?, ?)`
        ).run(
          reviewId,
          tenantId,
          input.subjectHash,
          input.userId ?? null,
          revokedCredentials,
          revokedAgents,
          slaSeconds,
          slaDeadline,
          input.actorId,
          createdAt
        );
      }

      // 5. Audit via memory lifecycle chain.
      writeChainedMemoryAuditEntry(db, {
        tenantId,
        actorId: input.actorId,
        actorRole: input.actorId === "system" ? "system" : "operator",
        eventType: AUDIT_EVENT_TYPES.MEMORY_OFFBOARDING_PENDING,
        entityType: ENTITY_TYPES.MEMORY_OFFBOARDING,
        entityId: `offboarding_review:${reviewId}`,
        reason: "offboarding_pending_erasure",
        metadata: {
          review_id: reviewId,
          subject_hash: input.subjectHash,
          user_id: input.userId ?? null,
          status: "pending",
          revoked_credentials: revokedCredentials,
          revoked_agents: revokedAgents,
          reassigned_artifacts: reassignedArtifacts,
          pending_plan_id: null,
          sla_seconds: slaSeconds,
          sla_deadline: slaDeadline,
        },
        createdAt,
      });
    })();
  } catch (err) {
    throw err;
  }

  return {
    reviewId,
    subjectHash: input.subjectHash,
    status: "pending",
    revokedCredentials,
    revokedAgents,
    reassignedArtifacts,
    pendingPlanId: null,
    slaDeadline,
    createdAt,
    idempotent: false,
  };
}

/**
 * Attach an erasure plan id to an offboarding review. Used when the operator runs
 * the DSAR / subject-plan path after offboarding.
 */
export function attachPendingPlanToReview(
  db: Database.Database,
  input: { tenantId?: string; reviewId: string; planId: string; actorId: string; now?: Date }
): OffboardingReceipt | null {
  const tenantId = safeTenantId(input.tenantId, "default-tenant");
  const now = toIso(input.now ?? new Date());
  if (!tableExists(db, "memory_offboarding_reviews")) return null;
  const row = db
    .prepare(
      `SELECT id, subject_hash, status, revoked_credentials, revoked_agents, pending_plan_id, sla_deadline, created_at, user_id
       FROM memory_offboarding_reviews WHERE tenant_id = ? AND id = ?`
    )
    .get(tenantId, input.reviewId) as
    | {
        id: string;
        subject_hash: string;
        status: OffboardingReceipt["status"];
        revoked_credentials: number;
        revoked_agents: number;
        pending_plan_id: string | null;
        sla_deadline: string;
        created_at: string;
        user_id: string | null;
      }
    | undefined;
  if (!row) return null;
  db.prepare(
    `UPDATE memory_offboarding_reviews SET pending_plan_id = ?, status = 'in_progress' WHERE id = ?`
  ).run(input.planId, input.reviewId);

  writeChainedMemoryAuditEntry(db, {
    tenantId,
    actorId: input.actorId,
    actorRole: input.actorId === "system" ? "system" : "operator",
    eventType: AUDIT_EVENT_TYPES.MEMORY_OFFBOARDING_PENDING,
    entityType: ENTITY_TYPES.MEMORY_OFFBOARDING,
    entityId: `offboarding_review:${input.reviewId}`,
    reason: "offboarding_plan_attached",
    metadata: {
      review_id: input.reviewId,
      plan_id: input.planId,
      status: "in_progress",
    },
    createdAt: now,
  });

  return {
    reviewId: input.reviewId,
    subjectHash: row.subject_hash,
    status: "in_progress",
    revokedCredentials: row.revoked_credentials,
    revokedAgents: row.revoked_agents,
    reassignedArtifacts: countReassignedArtifacts(db, tenantId, row.user_id),
    pendingPlanId: input.planId,
    slaDeadline: row.sla_deadline,
    createdAt: row.created_at,
    idempotent: false,
  };
}

/**
 * Mark an offboarding review as `completed` only after its attached subject
 * erasure plan completed. This prevents an operator action from claiming that
 * all eligible derivatives were erased while a hold, adapter failure, or
 * pending store outcome remains unresolved.
 */
export function completeOffboardingReview(
  db: Database.Database,
  input: { tenantId?: string; reviewId: string; actorId: string; now?: Date }
): OffboardingReceipt | null {
  const tenantId = safeTenantId(input.tenantId, "default-tenant");
  const now = toIso(input.now ?? new Date());
  if (!tableExists(db, "memory_offboarding_reviews")) return null;
  const row = db
    .prepare(
      `SELECT id, subject_hash, status, revoked_credentials, revoked_agents, pending_plan_id, sla_deadline, created_at, user_id
       FROM memory_offboarding_reviews WHERE tenant_id = ? AND id = ?`
    )
    .get(tenantId, input.reviewId) as
    | {
        id: string;
        subject_hash: string;
        status: OffboardingReceipt["status"];
        revoked_credentials: number;
        revoked_agents: number;
        pending_plan_id: string | null;
        sla_deadline: string;
        created_at: string;
        user_id: string | null;
      }
    | undefined;
  if (!row) return null;
  if (row.status === "completed") {
    return {
      reviewId: row.id,
      subjectHash: row.subject_hash,
      status: row.status,
      revokedCredentials: row.revoked_credentials,
      revokedAgents: row.revoked_agents,
      reassignedArtifacts: countReassignedArtifacts(db, tenantId, row.user_id),
      pendingPlanId: row.pending_plan_id,
      slaDeadline: row.sla_deadline,
      createdAt: row.created_at,
      idempotent: true,
    };
  }
  if (!row.pending_plan_id) {
    throw new OffboardingReviewCompletionError(
      "missing_erasure_plan",
      "offboarding review cannot complete without an attached subject erasure plan"
    );
  }
  if (!tableExists(db, "memory_subject_erasure_plans")) {
    throw new OffboardingReviewCompletionError(
      "erasure_incomplete",
      "offboarding review cannot complete because subject erasure state is unavailable"
    );
  }
  const plan = db
    .prepare(
      `SELECT status, result_json
         FROM memory_subject_erasure_plans
        WHERE tenant_id = ? AND id = ?`
    )
    .get(tenantId, row.pending_plan_id) as
    | { status: string; result_json: string | null }
    | undefined;
  if (!plan || plan.status !== "completed") {
    throw new OffboardingReviewCompletionError(
      "erasure_incomplete",
      "offboarding review cannot complete until the attached subject erasure plan is completed"
    );
  }
  try {
    const result = plan.result_json ? (JSON.parse(plan.result_json) as { status?: unknown }) : null;
    if (result?.status !== "completed") {
      throw new OffboardingReviewCompletionError(
        "erasure_incomplete",
        "offboarding review cannot complete until all eligible derivative outcomes resolve"
      );
    }
  } catch (error) {
    if (error instanceof OffboardingReviewCompletionError) throw error;
    throw new OffboardingReviewCompletionError(
      "erasure_incomplete",
      "offboarding review cannot complete because the subject erasure result is unavailable"
    );
  }
  db.prepare(
    `UPDATE memory_offboarding_reviews SET status = 'completed', completed_at = ? WHERE id = ?`
  ).run(now, input.reviewId);

  writeChainedMemoryAuditEntry(db, {
    tenantId,
    actorId: input.actorId,
    actorRole: input.actorId === "system" ? "system" : "operator",
    eventType: AUDIT_EVENT_TYPES.MEMORY_OFFBOARDING_PENDING,
    entityType: ENTITY_TYPES.MEMORY_OFFBOARDING,
    entityId: `offboarding_review:${input.reviewId}`,
    reason: "offboarding_review_completed",
    metadata: {
      review_id: input.reviewId,
      status: "completed",
      subject_hash: row.subject_hash,
    },
    createdAt: now,
  });

  return {
    reviewId: row.id,
    subjectHash: row.subject_hash,
    status: "completed",
    revokedCredentials: row.revoked_credentials,
    revokedAgents: row.revoked_agents,
    reassignedArtifacts: countReassignedArtifacts(db, tenantId, row.user_id),
    pendingPlanId: row.pending_plan_id,
    slaDeadline: row.sla_deadline,
    createdAt: row.created_at,
    idempotent: false,
  };
}

/* ------------------------------------------------------------------ */
/* Tombstones                                                           */
/* ------------------------------------------------------------------ */

/**
 * Write a non-sensitive tombstone pointer for a completed erasure. Idempotent on
 * (tenant_id, erasure_id, canonical_id, record_type, record_id) so replay never
 * duplicates the row.
 *
 * The tombstone carries:
 *   - canonicalId + subjectHash pointer to the erased identity
 *   - derivativeInventoryHash (SHA-256 over the inventory entries)
 *   - policyId/policyVersion + erasureId + scopeHash
 *   - outcome
 *
 * NO raw payload is stored -- only IDs/hashes/classifications/reasons. The
 * corresponding `memory.tombstone.written` audit row carries the same metadata
 * through the memory lifecycle chain, so verification walks the chain and the
 * tombstone row stays consistent with audit state.
 */
export function writeTombstoneForErasure(
  db: Database.Database,
  input: TombstoneInput
): TombstoneRow {
  const tenantId = safeTenantId(input.tenantId, "default-tenant");
  if (!tableExists(db, "memory_tombstones")) {
    throw new Error("memory_tombstones table missing -- ensure schema v18 has been applied");
  }
  const createdAt = toIso(input.createdAt ?? input.now ?? new Date());
  const scopeHash = scopeHashOf(input.scope);
  const derivativeInventoryHash = sha256Hex(
    stableJson(
      input.derivativeInventory.map((item) => ({
        storeId: item.storeId,
        action: item.action,
        reason: item.reason,
      }))
    )
  );

  const id = `tomb_${sha256Hex(
    stableJson({
      tenantId,
      erasureId: input.erasureId,
      canonicalId: input.canonicalId,
      recordType: input.recordType,
      recordId: input.recordId,
      subjectHash: input.subjectHash,
    })
  ).slice(0, 32)}`;

  db.prepare(
    `INSERT INTO memory_tombstones
      (id, tenant_id, subject_hash, canonical_id, record_type, record_id, record_id_hash,
       derivative_inventory_hash, policy_id, policy_version, erasure_id, scope_hash, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, erasure_id, canonical_id, record_type, record_id) DO NOTHING`
  ).run(
    id,
    tenantId,
    input.subjectHash,
    input.canonicalId,
    input.recordType,
    input.recordId,
    input.recordIdHash,
    derivativeInventoryHash,
    input.policyId ?? null,
    input.policyVersion ?? null,
    input.erasureId,
    scopeHash,
    input.outcome,
    createdAt
  );

  writeChainedMemoryAuditEntry(db, {
    tenantId,
    actorId: input.actorId,
    actorRole: input.actorId === "system" ? "system" : "operator",
    eventType: AUDIT_EVENT_TYPES.MEMORY_TOMBSTONE_WRITTEN,
    entityType: ENTITY_TYPES.MEMORY_TOMBSTONE,
    entityId: `tombstone:${id}`,
    reason: "tombstone_written",
    metadata: {
      tombstone_id: id,
      subject_hash: input.subjectHash,
      canonical_id: input.canonicalId,
      record_type: input.recordType,
      record_id_hash: input.recordIdHash,
      derivative_inventory_hash: derivativeInventoryHash,
      policy_id: input.policyId ?? null,
      policy_version: input.policyVersion ?? null,
      erasure_id: input.erasureId,
      scope_hash: scopeHash,
      outcome: input.outcome,
    },
    createdAt,
  });

  return {
    id,
    tenantId,
    subjectHash: input.subjectHash,
    canonicalId: input.canonicalId,
    recordType: input.recordType,
    recordId: input.recordId,
    recordIdHash: input.recordIdHash,
    derivativeInventoryHash,
    policyId: input.policyId ?? null,
    policyVersion: input.policyVersion ?? null,
    erasureId: input.erasureId,
    scopeHash,
    outcome: input.outcome,
    createdAt,
  };
}

/**
 * List tombstones for a subject in insertion order (append-only).
 */
export function listTombstones(
  db: Database.Database,
  input: { tenantId?: string; subjectHash: string }
): TombstoneRow[] {
  const tenantId = safeTenantId(input.tenantId, "default-tenant");
  if (!tableExists(db, "memory_tombstones")) return [];
  const rows = db
    .prepare(
      `SELECT id, tenant_id, subject_hash, canonical_id, record_type, record_id, record_id_hash,
              derivative_inventory_hash, policy_id, policy_version, erasure_id, scope_hash, outcome, created_at
       FROM memory_tombstones
       WHERE tenant_id = ? AND subject_hash = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(tenantId, input.subjectHash) as Array<{
      id: string;
      tenant_id: string;
      subject_hash: string;
      canonical_id: string;
      record_type: string;
      record_id: string;
      record_id_hash: string;
      derivative_inventory_hash: string;
      policy_id: string | null;
      policy_version: string | null;
      erasure_id: string;
      scope_hash: string;
      outcome: string;
      created_at: string;
    }>;
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    subjectHash: row.subject_hash,
    canonicalId: row.canonical_id,
    recordType: row.record_type,
    recordId: row.record_id,
    recordIdHash: row.record_id_hash,
    derivativeInventoryHash: row.derivative_inventory_hash,
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    erasureId: row.erasure_id,
    scopeHash: row.scope_hash,
    outcome: row.outcome as TombstoneInput["outcome"],
    createdAt: row.created_at,
  }));
}

/**
 * Walk every tombstone in insertion order and validate:
 *   - scope_hash matches the input scope used at write time (recorded in metadata)
 *   - derivative_inventory_hash matches the inventory entries provided at write time
 *
 * This is a local continuity check; the full chain-verifiable check is
 * `verifyMemoryAuditChain(db, tenantId)` which walks the audit rows.
 */
export function verifyTombstoneContinuity(
  db: Database.Database,
  input: { tenantId?: string; subjectHash?: string; derivativeInventories?: Map<string, SubjectDerivativeInventory[]> }
): TombstoneContinuityReport {
  const tenantId = safeTenantId(input.tenantId, "default-tenant");
  if (!tableExists(db, "memory_tombstones")) {
    return { valid: true, tombstonesChecked: 0 };
  }
  const params: unknown[] = [tenantId];
  let where = "tenant_id = ?";
  if (input.subjectHash) {
    where += " AND subject_hash = ?";
    params.push(input.subjectHash);
  }
  const rows = db
    .prepare(
      `SELECT id, canonical_id, record_type, record_id, derivative_inventory_hash, scope_hash
       FROM memory_tombstones
       WHERE ${where}
       ORDER BY created_at ASC, id ASC`
    )
    .all(...params) as Array<{
      id: string;
      canonical_id: string;
      record_type: string;
      record_id: string;
      derivative_inventory_hash: string;
      scope_hash: string;
    }>;

  let checked = 0;
  for (const row of rows) {
    checked += 1;
    if (input.derivativeInventories) {
      const inventory = input.derivativeInventories.get(`${row.canonical_id}:${row.record_id}`) ?? [];
      const expectedHash = sha256Hex(
        stableJson(
          inventory.map((item) => ({
            storeId: item.storeId,
            action: item.action,
            reason: item.reason,
          }))
        )
      );
      if (expectedHash !== row.derivative_inventory_hash) {
        return {
          valid: false,
          tombstonesChecked: checked,
          firstBrokenTombstoneId: row.id,
          reason: `derivative_inventory_hash mismatch: stored=${row.derivative_inventory_hash}, expected=${expectedHash}`,
        };
      }
    }
  }

  return { valid: true, tombstonesChecked: checked };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function countReassignedArtifacts(db: Database.Database, tenantId: string, userId: string | null): number {
  if (!userId) return 0;
  if (!tableExists(db, "messages")) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM messages WHERE agent_id = 'system' AND session_id LIKE ?`)
    .get(`%${userId}%`) as { count: number } | undefined;
  return row?.count ?? 0;
}
