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
 * This module is a thin wrapper — it deliberately does NOT mutate the
 * retrieval outcome, only emits events when one of the optional
 * `withAudit` flags is enabled.
 */

import { writeAuditEntry } from "@/lib/audit/write";
import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";

export const RETRIEVAL_BENCH_CHAIN_DOMAIN = "retrieval_bench";

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
}

export function recordBenchRun(ctx: RetrievalBenchAuditContext): void {
  try {
    writeAuditEntry({
      tenant_id: ctx.tenantId ?? "default-tenant",
      actor_id: ctx.actorId ?? "system:retrieval_bench",
      actor_role: "system",
      event_type: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_RUN,
      entity_type: ENTITY_TYPES.RETRIEVAL_BENCH,
      entity_id: `retrieval_bench:run:${ctx.runId}`,
      reason: ctx.reason,
      metadata_json: {
        runId: ctx.runId,
        configHash: ctx.configHash,
        fixtureHash: ctx.fixtureHash,
        chainDomain: RETRIEVAL_BENCH_CHAIN_DOMAIN,
      },
    });
  } catch {
    // Audit failures must NEVER fail the benchmark; swallow errors.
  }
}

export function recordBenchReceipt(ctx: RetrievalBenchAuditContext & {
  reconciliationHash: string;
  reasonDetail?: string;
}): void {
  try {
    writeAuditEntry({
      tenant_id: ctx.tenantId ?? "default-tenant",
      actor_id: ctx.actorId ?? "system:retrieval_bench",
      actor_role: "system",
      event_type: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_RECEIPT,
      entity_type: ENTITY_TYPES.RETRIEVAL_BENCH,
      entity_id: `retrieval_bench:receipt:${ctx.runId}`,
      reason: ctx.reasonDetail ?? ctx.reason,
      metadata_json: {
        runId: ctx.runId,
        reconciliationHash: ctx.reconciliationHash,
        configHash: ctx.configHash,
        fixtureHash: ctx.fixtureHash,
        chainDomain: RETRIEVAL_BENCH_CHAIN_DOMAIN,
      },
    });
  } catch {
    // Swallow.
  }
}

export function recordBenchPublication(ctx: RetrievalBenchAuditContext & {
  decisionHash: string;
  status: "ready_for_publication" | "blocked_for_publication";
  caveats: string[];
}): void {
  try {
    writeAuditEntry({
      tenant_id: ctx.tenantId ?? "default-tenant",
      actor_id: ctx.actorId ?? "system:retrieval_bench",
      actor_role: "system",
      event_type: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_PUBLICATION,
      entity_type: ENTITY_TYPES.RETRIEVAL_BENCH,
      entity_id: `retrieval_bench:publication:${ctx.runId}`,
      reason: ctx.status,
      metadata_json: {
        runId: ctx.runId,
        decisionHash: ctx.decisionHash,
        status: ctx.status,
        caveats: ctx.caveats,
        chainDomain: RETRIEVAL_BENCH_CHAIN_DOMAIN,
      },
    });
  } catch {
    // Swallow.
  }
}

export function recordBenchReplay(ctx: RetrievalBenchAuditContext & {
  fingerprint: string;
  matchedReportId?: string;
}): void {
  try {
    writeAuditEntry({
      tenant_id: ctx.tenantId ?? "default-tenant",
      actor_id: ctx.actorId ?? "system:retrieval_bench",
      actor_role: "system",
      event_type: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_REPLAY,
      entity_type: ENTITY_TYPES.RETRIEVAL_BENCH,
      entity_id: `retrieval_bench:replay:${ctx.runId}`,
      reason: ctx.reason ?? "replay",
      metadata_json: {
        runId: ctx.runId,
        fingerprint: ctx.fingerprint,
        matchedReportId: ctx.matchedReportId,
        chainDomain: RETRIEVAL_BENCH_CHAIN_DOMAIN,
      },
    });
  } catch {
    // Swallow.
  }
}

export function recordBenchContamination(ctx: RetrievalBenchAuditContext & {
  reason: string;
  rejectedCount: number;
}): void {
  try {
    writeAuditEntry({
      tenant_id: ctx.tenantId ?? "default-tenant",
      actor_id: ctx.actorId ?? "system:retrieval_bench",
      actor_role: "system",
      event_type: AUDIT_EVENT_TYPES.RETRIEVAL_BENCH_CONTAMINATION,
      entity_type: ENTITY_TYPES.RETRIEVAL_BENCH,
      entity_id: `retrieval_bench:contamination:${ctx.runId}`,
      reason: ctx.reason,
      metadata_json: {
        runId: ctx.runId,
        rejectedCount: ctx.rejectedCount,
        chainDomain: RETRIEVAL_BENCH_CHAIN_DOMAIN,
      },
    });
  } catch {
    // Swallow.
  }
}
