/**
 * Retrieval-bench audit chain integration (VAL-RETR-026).
 *
 * The retrieval-bench module produces events that must land in the
 * Memroos audit chain. This module bridges the module's typed outcomes
 * to the central audit service.
 *
 * Each entry uses the `retrieval_bench` chain domain so that:
 *   - The audit chain verifier can verify chain integrity
 *   - Append-only semantics apply (events are INSERT-only)
 *   - Existing MEMSEC-08 regression tests remain untouched
 *
 * Round 2 scrutiny fix (production-integrity):
 *
 *   1. Audit writers MUST return a typed `BenchAuditOutcome` rather
 *      than silently swallow persistence failures. The runner uses the
 *      outcome to mark receipts unverified, block publication, and
 *      surface explicit non-success states.
 *   2. Audit writers MUST honor a shared WriteGuard so `--no-write`
 *      prevents every persistence side effect, including SQLite audit
 *      creation or mutation.
 *   3. Audit writers MUST thread persistence state forward to the
 *      publication gate so a failed or skipped audit write produces a
 *      typed non-success state and blocks the run/report publication.
 *
 * The module is a thin wrapper — it does NOT mutate the retrieval
 * outcome, only emits events when `withAudit` is enabled and the
 * WriteGuard permits persistence.
 */

import { writeAuditEntry } from "@/lib/audit/write";
import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";

export const RETRIEVAL_BENCH_CHAIN_DOMAIN = "retrieval_bench";

/**
 * Typed persistence outcome for a single audit write attempt. Production
 * callers MUST consume this outcome and propagate failures to the
 * publication gate.
 */
export type BenchAuditOutcome =
  | {
      ok: true;
      status: "persisted" | "skipped_no_write" | "persisted_via_test_sink";
      reason?: string;
      auditId?: string;
    }
  | {
      ok: false;
      status: "persistence_failed";
      reason: string;
      error?: unknown;
    };

/**
 * Test seam: when set, audit writers call this hook instead of touching
 * the SQLite singleton. The hook must return a typed outcome so the
 * runner can surface failures end-to-end. When `null`, writers always
 * attempt a real SQLite insert (and any failure becomes a typed error).
 */
export type BenchAuditSink = (
  args: {
    eventType: string;
    entityType: string;
    entityId: string;
    reason?: string;
    metadataJson: Record<string, unknown>;
  },
) => BenchAuditOutcome;

let activeSink: BenchAuditSink | null = null;

export function setBenchAuditSink(sink: BenchAuditSink | null): void {
  activeSink = sink;
}

export function getBenchAuditSink(): BenchAuditSink | null {
  return activeSink;
}

export function resetBenchAuditSink(): void {
  activeSink = null;
}

/**
 * Marker identifier for the run/audit attempt so the runner can group
 * outcomes by lifecycle stage.
 */
export interface RetrievalBenchAuditContext {
  tenantId?: string;
  actorId?: string;
  /** The run id being recorded. */
  runId: string;
  /** Decision cache (fingerprint / hash) when relevant. */
  configHash?: string;
  fixtureHash?: string;
  /** Reason / status label. */
  reason?: string;
  /**
   * When true, the audit writer MUST short-circuit without persisting.
   * This is the canonical hook for the shared WriteGuard so that
   * `--no-write` produces zero database writes.
   */
  skipWrite?: boolean;
}

function baseMetadata(ctx: RetrievalBenchAuditContext): Record<string, unknown> {
  return {
    runId: ctx.runId,
    tenantId: ctx.tenantId ?? "default-tenant",
    actorId: ctx.actorId ?? "system:retrieval_bench",
    configHash: ctx.configHash,
    fixtureHash: ctx.fixtureHash,
    chainDomain: RETRIEVAL_BENCH_CHAIN_DOMAIN,
  };
}

function writeThrough({
  eventType,
  entityType,
  entityId,
  reason,
  metadataJson,
  skipWrite,
}: {
  eventType: string;
  entityType: string;
  entityId: string;
  reason?: string;
  metadataJson: Record<string, unknown>;
  skipWrite: boolean;
}): BenchAuditOutcome {
  if (skipWrite) {
    return {
      ok: true,
      status: "skipped_no_write",
      reason: "write_guard_armed",
    };
  }

  const sink = activeSink;
  if (sink) {
    try {
      return sink({ eventType, entityType, entityId, reason, metadataJson });
    } catch (err) {
      return {
        ok: false,
        status: "persistence_failed",
        reason:
          err instanceof Error
            ? "sink_threw:" + err.message
            : "sink_threw_unknown",
        error: err,
      };
    }
  }

  try {
    writeAuditEntry({
      tenant_id: (metadataJson["tenantId"] as string | undefined) ?? "default-tenant",
      actor_id: (metadataJson["actorId"] as string | undefined) ?? "system:retrieval_bench",
      actor_role: "system",
      event_type: eventType as never,
      entity_type: entityType as never,
      entity_id: entityId,
      reason,
      metadata_json: metadataJson,
    });
    return { ok: true, status: "persisted" };
  } catch (err) {
    return {
      ok: false,
      status: "persistence_failed",
      reason:
        err instanceof Error
          ? "audit_insert_failed:" + err.message
          : "audit_insert_failed_unknown",
      error: err,
    };
  }
}

export function recordBenchRun(ctx: RetrievalBenchAuditContext): BenchAuditOutcome {
  return writeThrough({
    eventType: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_RUN,
    entityType: ENTITY_TYPES.RETRIEVAL_BENCH,
    entityId: `retrieval_bench:run:${ctx.runId}`,
    reason: ctx.reason,
    metadataJson: baseMetadata(ctx),
    skipWrite: !!ctx.skipWrite,
  });
}

export function recordBenchReceipt(
  ctx: RetrievalBenchAuditContext & {
    reconciliationHash: string;
    reasonDetail?: string;
  },
): BenchAuditOutcome {
  return writeThrough({
    eventType: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_RECEIPT,
    entityType: ENTITY_TYPES.RETRIEVAL_BENCH,
    entityId: `retrieval_bench:receipt:${ctx.runId}`,
    reason: ctx.reasonDetail ?? ctx.reason,
    metadataJson: {
      ...baseMetadata(ctx),
      reconciliationHash: ctx.reconciliationHash,
    },
    skipWrite: !!ctx.skipWrite,
  });
}

export function recordBenchPublication(
  ctx: RetrievalBenchAuditContext & {
    decisionHash: string;
    status: "ready_for_publication" | "blocked_for_publication";
    caveats: string[];
  },
): BenchAuditOutcome {
  return writeThrough({
    eventType: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_PUBLICATION,
    entityType: ENTITY_TYPES.RETRIEVAL_BENCH,
    entityId: `retrieval_bench:publication:${ctx.runId}`,
    reason: ctx.status,
    metadataJson: {
      ...baseMetadata(ctx),
      decisionHash: ctx.decisionHash,
      status: ctx.status,
      caveats: ctx.caveats,
    },
    skipWrite: !!ctx.skipWrite,
  });
}

export function recordBenchReplay(
  ctx: RetrievalBenchAuditContext & {
    fingerprint: string;
    matchedReportId?: string;
  },
): BenchAuditOutcome {
  return writeThrough({
    eventType: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_REPLAY,
    entityType: ENTITY_TYPES.RETRIEVAL_BENCH,
    entityId: `retrieval_bench:replay:${ctx.runId}`,
    reason: ctx.reason ?? "replay",
    metadataJson: {
      ...baseMetadata(ctx),
      fingerprint: ctx.fingerprint,
      matchedReportId: ctx.matchedReportId,
    },
    skipWrite: !!ctx.skipWrite,
  });
}

export function recordBenchContamination(
  ctx: RetrievalBenchAuditContext & {
    reason: string;
    rejectedCount: number;
  },
): BenchAuditOutcome {
  return writeThrough({
    eventType: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_CONTAMINATION,
    entityType: ENTITY_TYPES.RETRIEVAL_BENCH,
    entityId: `retrieval_bench:contamination:${ctx.runId}`,
    reason: ctx.reason,
    metadataJson: {
      ...baseMetadata(ctx),
      rejectedCount: ctx.rejectedCount,
    },
    skipWrite: !!ctx.skipWrite,
  });
}
