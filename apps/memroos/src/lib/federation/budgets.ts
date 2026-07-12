/**
 * MSIQ-05 (VAL-ORCH-007): Federation global + per-source budgets.
 *
 * Strictest-of: source_count, result_count, hops, fanout, bytes, calls,
 * deadline. Malformed/zero/absent mandatory bounds fail closed.
 */

import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
export interface FederationBudgetConfig {
  sourceCount: number;
  perSourceResultCount: number;
  globalResultCount: number;
  hops: number;
  fanout: number;
  maxBytes: number;
  maxCalls: number;
  deadlineMs: number;
}

export type FederationBudgetDecision =
  | { kind: "allowed"; budget: FederationBudgetConfig; reason: string }
  | { kind: "rejected"; reason: string; field: keyof FederationBudgetConfig };
export function validateFederationBudget(
  config: Partial<FederationBudgetConfig>,
): FederationBudgetDecision {
  const fields: Array<keyof FederationBudgetConfig> = [
    "sourceCount",
    "perSourceResultCount",
    "globalResultCount",
    "hops",
    "fanout",
    "maxBytes",
    "maxCalls",
    "deadlineMs",
  ];
  for (const f of fields) {
    const v = config[f];
    if (v === undefined || v === null) {
      return { kind: "rejected", reason: "missing budget field: " + f, field: f };
    }
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return { kind: "rejected", reason: "invalid budget field: " + f + "=" + v, field: f };
    }
  }
  return {
    kind: "allowed",
    reason: "budget_ok",
    budget: config as FederationBudgetConfig,
  };
}

export class BudgetTracker {
  private globalResultCount = 0;
  private globalBytes = 0;
  private globalCalls = 0;
  private startedAt = Date.now();
  private perSource: Map<string, { results: number; bytes: number; calls: number }> = new Map();
  private rejectionReason: string | null = null;

  constructor(private readonly config: FederationBudgetConfig) {}

  remainingBudget(): FederationBudgetConfig {
    const elapsed = Date.now() - this.startedAt;
    return {
      sourceCount: this.config.sourceCount,
      perSourceResultCount: this.config.perSourceResultCount,
      globalResultCount: Math.max(0, this.config.globalResultCount - this.globalResultCount),
      hops: this.config.hops,
      fanout: this.config.fanout,
      maxBytes: Math.max(0, this.config.maxBytes - this.globalBytes),
      maxCalls: Math.max(0, this.config.maxCalls - this.globalCalls),
      deadlineMs: Math.max(0, this.config.deadlineMs - elapsed),
    };
  }

  startSource(sourceId: string): { ok: true } | { ok: false; reason: string } {
    if (this.rejectionReason) return { ok: false, reason: this.rejectionReason };
    if (this.perSource.size >= this.config.sourceCount) {
      this.rejectionReason = "global_source_count_exceeded";
      return { ok: false, reason: this.rejectionReason };
    }
    if (Date.now() - this.startedAt > this.config.deadlineMs) {
      this.rejectionReason = "deadline_exceeded";
      return { ok: false, reason: this.rejectionReason };
    }
    if (this.globalCalls >= this.config.maxCalls) {
      this.rejectionReason = "global_call_count_exceeded";
      return { ok: false, reason: this.rejectionReason };
    }
    if (!this.perSource.has(sourceId)) {
      this.perSource.set(sourceId, { results: 0, bytes: 0, calls: 0 });
    }
    this.globalCalls += 1;
    const s = this.perSource.get(sourceId)!;
    s.calls += 1;
    return { ok: true };
  }

  recordResult(sourceId: string, resultBytes: number): { ok: true } | { ok: false; reason: string } {
    if (this.rejectionReason) return { ok: false, reason: this.rejectionReason };
    if (this.globalResultCount >= this.config.globalResultCount) {
      this.rejectionReason = "global_result_count_exceeded";
      return { ok: false, reason: this.rejectionReason };
    }
    if (this.globalBytes + resultBytes > this.config.maxBytes) {
      this.rejectionReason = "global_byte_budget_exceeded";
      return { ok: false, reason: this.rejectionReason };
    }
    const s = this.perSource.get(sourceId);
    if (!s) return { ok: false, reason: "unknown_source" };
    if (s.results >= this.config.perSourceResultCount) {
      this.rejectionReason = "per_source_result_count_exceeded";
      return { ok: false, reason: this.rejectionReason };
    }
    s.results += 1;
    s.bytes += resultBytes;
    this.globalResultCount += 1;
    this.globalBytes += resultBytes;
    return { ok: true };
  }

  snapshot() {
    return {
      config: this.config,
      globalResultCount: this.globalResultCount,
      globalBytes: this.globalBytes,
      globalCalls: this.globalCalls,
      perSource: Object.fromEntries(this.perSource),
      rejectionReason: this.rejectionReason,
    };
  }
}

export function recordFederationBudgetExceeded(
  db: Database.Database,
  tenantId: string,
  federationRunId: string,
  reason: string,
  metadata: Record<string, unknown>,
): void {
  try {
    writeAuditEntry(
      {
        tenant_id: tenantId,
        actor_id: "system",
        actor_role: "system",
        event_type: AUDIT_EVENT_TYPES.ORCH_FEDERATION_BUDGET_EXCEEDED,
        entity_type: ENTITY_TYPES.FEDERATION_BUDGET,
        entity_id: "federation_budget:" + federationRunId,
        reason: reason,
        metadata_json: metadata,
      },
      db,
    );
  } catch {
    // ignore
  }
}
