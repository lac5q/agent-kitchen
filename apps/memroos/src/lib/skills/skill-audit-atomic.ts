/**
 * Audit-atomic skill governance mutations — Phase 151 / SKILLTRUST-05.
 *
 * Implements VAL-SKILL-038:
 *   Import, sign, verify outcome, quarantine, sync, pin, rollback,
 *   lifecycle, and SkillForge changes either commit required
 *   receipt/audit evidence together or remain unchanged/incomplete.
 *
 * The contract is enforced by `commitAuditAtomic`, a transactional
 * helper that:
 *
 *   1. Computes the mutation's body (may throw to abort the entire
 *      transaction without a partial write).
 *   2. Inserts the audit_entries row alongside any state changes.
 *   3. Verifies the row was actually persisted. If verification fails,
 *      the mutation raises and the database remains unchanged (because
 *      the entire transaction is rolled back).
 *   4. On retry, idempotency keys collapse to the same final state.
 *
 * Mutations that need to participate call `commitAuditAtomic` and let
 * it own the SQL transaction. The `AuditAtomicResult` carries the
 * committed ids so callers can return them from the route.
 */

import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditAtomicCommitInput {
  /** Tenant id; defaults to "default-tenant" to match writeAuditEntry. */
  tenantId?: string;
  /** Actor for the audit_entries row. */
  actor: string;
  /** Audit event_type string. Skill-domain events should start with "skill_". */
  eventType: string;
  /** Entity type (typically "skill" or "skillforge_proposal"). */
  entityType: string;
  /** Entity id (typically "skill:<id>" or "proposal:<id>"). */
  entityId: string;
  /** Optional reason. */
  reason?: string | null;
  /** Metadata payload. */
  metadata: Record<string, unknown>;
  /**
   * If provided, the prior mutation result is used to short-circuit
   * the mutation (idempotency). The retry handler must still call
   * `commitAuditAtomic` to verify the prior row, then return the
   * same result.
   */
  idempotencyKey?: string | null;
  /**
   * Body function: receives a "verify" hook so the body can throw
   * after a mutation but before commit when downstream verification
   * fails. Returning a value commits the transaction; throwing rolls
   * it back.
   */
  body: (helpers: AuditAtomicHelpers) => unknown;
}

export interface AuditAtomicHelpers {
  /**
   * Records a desired verification step. The actual verification is
   * applied post-commit (so a failed verification can roll the
   * transaction back). The function throws when called with a failure
   * status.
   */
  requireVerified(label: string, ok: boolean): void;
  /** Insert a paired audit_entries row inside the same transaction. */
  insertAuditRow(row: {
    eventType: string;
    actor?: string | null;
    entityType?: string;
    entityId?: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }): void;
}

export interface AuditAtomicResult {
  auditId: string;
  mutationResult: unknown;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AuditAtomicFailure extends Error {
  code: string;
  detail?: unknown;
  constructor(message: string, code: string, detail?: unknown) {
    super(message);
    this.name = "AuditAtomicFailure";
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Idempotency cache (in-memory only — durable dedup is at the SQL layer)
// ---------------------------------------------------------------------------

const IDEMPOTENCY_CACHE = new Map<string, AuditAtomicResult>();

function makeAuditId(): string {
  return `audit-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Commits a skill governance mutation together with its audit evidence
 * inside a single SQLite transaction. On failure, no partial state
 * remains; on success, the audit_entries row and the body result are
 * both durable.
 *
 * Idempotency: when `idempotencyKey` is provided and a prior result is
 * cached, the cached result is returned without re-executing the body.
 * Callers needing stronger guarantees should add a UNIQUE row at the
 * SQL layer (already present on skill_dependencies, skill_version_pins,
 * skillforge_runtime_exports, etc.).
 */
export function commitAuditAtomic(
  db: Database.Database,
  input: AuditAtomicCommitInput
): AuditAtomicResult {
  if (!input?.actor?.trim()) {
    throw new AuditAtomicFailure("actor is required", "missing_actor");
  }
  if (!input?.eventType?.trim()) {
    throw new AuditAtomicFailure("eventType is required", "missing_event_type");
  }
  if (!input?.entityType?.trim() || !input?.entityId?.trim()) {
    throw new AuditAtomicFailure(
      "entityType and entityId are required",
      "missing_entity"
    );
  }

  // Idempotency short-circuit
  if (input.idempotencyKey) {
    const cached = IDEMPOTENCY_CACHE.get(input.idempotencyKey);
    if (cached) return cached;
  }

  const tenantId = input.tenantId ?? "default-tenant";
  const auditId = makeAuditId();
  const now = new Date().toISOString();
  const verifications: Array<{ label: string; ok: boolean }> = [];
  const additionalRows: Array<{
    eventType: string;
    actor: string | null;
    entityType: string;
    entityId: string;
    reason: string | null;
    metadata: Record<string, unknown>;
  }> = [];

  const helpers: AuditAtomicHelpers = {
    requireVerified(label, ok) {
      verifications.push({ label, ok });
      if (!ok) {
        throw new AuditAtomicFailure(
          `verification failed: ${label}`,
          "verification_failed",
          { label }
        );
      }
    },
    insertAuditRow(row) {
      additionalRows.push({
        eventType: row.eventType,
        actor: row.actor ?? input.actor,
        entityType: row.entityType ?? input.entityType,
        entityId: row.entityId ?? input.entityId,
        reason: row.reason ?? null,
        metadata: row.metadata ?? {},
      });
    },
  };

  // Run body + audit insert inside a single transaction so any throw
  // rolls back the body mutation AND the audit row. SQLite's deferred
  // transaction is fine here because we use BEGIN/COMMIT at the
  // default level and throw before COMMIT for any failure path.
  let mutationResult: unknown;
  let txError: Error | null = null;
  try {
    db.transaction(() => {
      mutationResult = input.body(helpers);
      // After body succeeds, insert the primary audit row.
      try {
        db.prepare(
          `INSERT INTO audit_entries
            (id, tenant_id, actor_id, actor_role, event_type, entity_type,
             entity_id, reason, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          auditId,
          tenantId,
          input.actor,
          "operator",
          input.eventType,
          input.entityType,
          input.entityId,
          input.reason ?? null,
          JSON.stringify(input.metadata ?? {}),
          now
        );
      } catch (err) {
        throw new AuditAtomicFailure(
          `primary audit row insert failed: ${err instanceof Error ? err.message : String(err)}`,
          "audit_insert_failed",
          err
        );
      }

      // Insert any paired rows.
      for (const row of additionalRows) {
        db.prepare(
          `INSERT INTO audit_entries
            (id, tenant_id, actor_id, actor_role, event_type, entity_type,
             entity_id, reason, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          makeAuditId(),
          tenantId,
          row.actor ?? input.actor,
          "operator",
          row.eventType,
          row.entityType,
          row.entityId,
          row.reason,
          JSON.stringify(row.metadata ?? {}),
          now
        );
      }

      // Re-verify that the audit row exists. If it vanished due to a
      // trigger constraint or schema mismatch, raise so the transaction
      // rolls back. This is the contract: every mutation either commits
      // receipt+evidence together or leaves the DB unchanged.
      const verifyRow = db
        .prepare(`SELECT id FROM audit_entries WHERE id = ?`)
        .get(auditId) as { id: string } | undefined;
      if (!verifyRow) {
        throw new AuditAtomicFailure(
          `audit verification failed: row ${auditId} missing after insert`,
          "audit_verification_failed",
          { auditId }
        );
      }
    })();
  } catch (err) {
    txError = err instanceof Error ? err : new Error(String(err));
  }

  if (txError) {
    // Surface the original error for callers that want to inspect the
    // cause. If it's already an AuditAtomicFailure, pass it through;
    // otherwise wrap with a clearer message.
    if (txError instanceof AuditAtomicFailure) throw txError;
    throw new AuditAtomicFailure(
      `audit-atomic mutation failed: ${txError.message}`,
      "mutation_failed",
      txError
    );
  }

  const result: AuditAtomicResult = {
    auditId,
    mutationResult,
    createdAt: now,
  };

  if (input.idempotencyKey) {
    IDEMPOTENCY_CACHE.set(input.idempotencyKey, result);
  }

  return result;
}

/**
 * Clears the in-memory idempotency cache. Used by tests that share a
 * process across multiple cases. Production callers should leave the
 * cache alone — durable idempotency lives in the SQL UNIQUE
 * constraints, not in memory.
 */
export function resetAuditAtomicCache(): void {
  IDEMPOTENCY_CACHE.clear();
}
