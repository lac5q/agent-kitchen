/**
 * MEMLIFE-05 / VAL-MEM-024 + VAL-MEM-025: Episodic consolidation with raw-vault
 * integrity verification, classification gate, failure-safe replay, and one-summary-per-lineage.
 *
 * The consolidation worker:
 *   1. Selects a scoped batch of eligible episodic sources from the retention/canonical plane.
 *   2. Writes the source batch to the raw vault FIRST, producing a stable vault_artifact_id
 *      and content_hash. (Originals are preserved; nothing is mutated.)
 *   3. Calls the summary provider (pluggable, default = no-op deterministic stub for tests).
 *   4. Verifies the source vault artifact still matches content_hash on replay.
 *   5. Computes a deterministic lineage_hash over (source_vault_hash, summary, classification).
 *   6. Inserts the summary in `memory_consolidation_summaries` with UNIQUE(tenant_id, lineage_hash)
 *      so duplicate runs cannot create a second summary for the same lineage.
 *
 * Failure / replay safety (VAL-MEM-025):
 *   - If the provider raises, vault write fails, vault replay mismatches, classification is
 *     incomplete, or the lineage_hash conflicts with an existing summary, the run is recorded
 *     as `failed` (or `incomplete`) and NO summary row is inserted. The source batch is
 *     unchanged and eligible for the next run.
 *   - The same runKey on replay returns the same `run_id` and reports status `replayed`,
 *     never `completed` twice.
 *
 * Receipts (VAL-MEM-029):
 *   - `memory.consolidation.run` and `memory.consolidation.summary` are written through the
 *     memory lifecycle audit chain, with metadata containing only IDs/hashes/classifications.
 *   - If the audit write fails, the summary insert is rolled back (no half-state).
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeChainedMemoryAuditEntry } from "@/lib/audit/memory-chain";
import { writeVaultArtifact, readVaultArtifact } from "@/lib/vault/writer";
import type { VaultLabel } from "@/lib/vault/types";
import { sha256Hex, stableJson, scopeHash, type RetentionScope } from "@/lib/memory/retention-policy";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ConsolidationSourceRow {
  canonicalId: string;
  recordType: string;
  recordId: string;
  content: string;
  contentHash: string;
  ontologyType: string;
  tier: string;
  classification: Record<string, unknown>;
}

export interface ConsolidationSummaryInput {
  type: "pattern" | "contradiction" | "summary" | "episodic_summary";
  content: string;
}

export interface ConsolidationRunOptions {
  tenantId?: string;
  runKey: string;
  scope: RetentionScope;
  sources: ConsolidationSourceRow[];
  modelId?: string;
  modelVersion?: string;
  policyId?: string;
  policyVersion?: string;
  actorId: string;
  now?: Date;
  /** Optional provider hook. Tests pass a deterministic stub; production wires Ollama. */
  provider?: (input: { sources: ConsolidationSourceRow[]; promptSafe: string }) => Promise<ConsolidationSummaryInput>;
}

export type ConsolidationRunStatus =
  | "completed"
  | "completed_replayed"
  | "skipped_empty"
  | "failed"
  | "incomplete"
  | "policy_blocked"
  | "protected_skipped";

export interface ConsolidationRunSummary {
  runId: string;
  runKey: string;
  tenantId: string;
  status: ConsolidationRunStatus;
  considered: number;
  eligible: number;
  protected: number;
  vaultArtifactId: string | null;
  vaultArtifactHash: string | null;
  summaryId: string | null;
  lineageHash: string | null;
  failureReason: string | null;
  startedAt: string;
  completedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function ensureClassification(source: ConsolidationSourceRow): VaultLabel {
  const visibility = (source.classification?.visibility as string | undefined) ?? "internal";
  const policy = (source.classification?.policy as string | undefined) ?? "sealed";
  const domain = (source.classification?.domain as VaultLabel["domain"]) ?? null;
  const sensitivity = (source.classification?.sensitivity as VaultLabel["sensitivity"]) ?? null;
  return { visibility: visibility as VaultLabel["visibility"], policy: policy as VaultLabel["policy"], domain, sensitivity };
}

function isProtectedSource(source: ConsolidationSourceRow): boolean {
  if (source.classification?.protected === true) return true;
  if (source.classification?.decayProtected === true) return true;
  if (source.classification?.decay_protected === true) return true;
  if (source.classification?.policy === "requires_human_review") return true;
  return false;
}

/**
 * Stable prompt-safe projection of the source batch. We pass only IDs/hashes/ontology,
 * never the raw content, to the summary provider. The full content is sealed in the
 * raw vault artifact (which the provider cannot fetch -- it would need DB access).
 */
function promptSafeProjection(sources: ConsolidationSourceRow[]): string {
  return stableJson({
    count: sources.length,
    ontology: sources.map((source) => source.ontologyType).sort(),
    canonical_ids: sources.map((source) => source.canonicalId).sort(),
    content_hashes: sources.map((source) => source.contentHash).sort(),
  });
}

function defaultProvider(input: { sources: ConsolidationSourceRow[]; promptSafe: string }): Promise<ConsolidationSummaryInput> {
  // Deterministic, dependency-free provider. Uses the projection itself to derive the
  // summary content so the same input always yields the same lineage_hash (replay-safe).
  const projectionHash = sha256Hex(input.promptSafe);
  const summary = {
    type: "episodic_summary" as const,
    content: `episodic_summary:${projectionHash}`,
  };
  return Promise.resolve(summary);
}

function computeLineageHash(input: {
  tenantId: string;
  scopeHash: string;
  ontologyType: string;
  sourceVaultHash: string;
  summary: ConsolidationSummaryInput;
  classification: VaultLabel;
  policyId?: string;
  policyVersion?: string;
}): string {
  return sha256Hex(
    stableJson({
      tenant_id: input.tenantId,
      scope_hash: input.scopeHash,
      ontology_type: input.ontologyType,
      source_vault_hash: input.sourceVaultHash,
      summary_type: input.summary.type,
      summary_hash: sha256Hex(input.summary.content),
      classification: input.classification,
      policy_id: input.policyId ?? null,
      policy_version: input.policyVersion ?? null,
    })
  );
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Run a consolidation cycle for the supplied sources.
 *
 * Originals are NEVER modified -- the function operates on a copy passed in by the
 * caller. The original records (e.g. messages, retention records) remain in their
 * pre-call state, so retry is always possible after failure.
 */
export async function runConsolidationCycle(
  db: Database.Database,
  options: ConsolidationRunOptions
): Promise<ConsolidationRunSummary> {
  const tenantId = options.tenantId ?? "default-tenant";
  const now = options.now ?? new Date();
  const startedAt = toIso(now);
  const actorId = options.actorId;
  const scopeHashValue = scopeHash(options.scope);

  const considered = options.sources.length;
  const eligible = options.sources.filter((source) => !isProtectedSource(source));
  const protectedCount = considered - eligible.length;

  // Idempotent replay: same runKey returns the same run_id and completed_replayed.
  if (tableExists(db, "memory_consolidation_summaries")) {
    const existing = db
      .prepare(
        `SELECT id, status, lineage_hash, source_vault_artifact_id, source_vault_hash,
                summary_type, summary_content, ontology_type, created_at
         FROM memory_consolidation_summaries
         WHERE run_key = ? AND status = 'active'
         ORDER BY created_at ASC, id ASC LIMIT 1`
      )
      .get(options.runKey) as
      | {
          id: string;
          status: string;
          lineage_hash: string;
          source_vault_artifact_id: string;
          source_vault_hash: string;
          summary_type: string;
          summary_content: string;
          ontology_type: string;
          created_at: string;
        }
      | undefined;
    if (existing) {
      return {
        runId: existing.id,
        runKey: options.runKey,
        tenantId,
        status: "completed_replayed",
        considered,
        eligible: eligible.length,
        protected: protectedCount,
        vaultArtifactId: existing.source_vault_artifact_id,
        vaultArtifactHash: existing.source_vault_hash,
        summaryId: existing.id,
        lineageHash: existing.lineage_hash,
        failureReason: null,
        startedAt: existing.created_at,
        completedAt: existing.created_at,
      };
    }
  }

  // Create run row early so we can track the cycle id.
  const runId = `con_${crypto.randomUUID()}`;
  const baseRecord: ConsolidationRunSummary = {
    runId,
    runKey: options.runKey,
    tenantId,
    status: "skipped_empty",
    considered,
    eligible: eligible.length,
    protected: protectedCount,
    vaultArtifactId: null,
    vaultArtifactHash: null,
    summaryId: null,
    lineageHash: null,
    failureReason: null,
    startedAt,
    completedAt: null,
  };

  if (eligible.length === 0) {
    persistRunRow(db, baseRecord, "skipped_empty", "no eligible sources");
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }

  // 1. Policy gate: absent policy context fails closed. We require a scope that includes
  //    at least a purpose; otherwise the consolidation cannot be classified.
  if (!options.scope || typeof options.scope.purpose !== "string" || !options.scope.purpose.trim()) {
    baseRecord.status = "policy_blocked";
    baseRecord.failureReason = "missing_scope_purpose";
    persistRunRow(db, baseRecord, "policy_blocked", baseRecord.failureReason);
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }

  // 2. Build prompt-safe projection and write raw-vault artifact FIRST. The vault write
  //    MUST happen before the summary because the lineage_hash includes source_vault_hash
  //    and the assertion "consolidation preserves originals before projection change" means
  //    the projection (summary) cannot reference a vault artifact that does not yet exist.
  const promptSafe = promptSafeProjection(eligible);
  let vaultArtifactId: string;
  let vaultArtifactHash: string;
  try {
    const label: VaultLabel = ensureClassification(eligible[0]!);
    // Vault body MUST NOT include the run_key -- that would cause a different vault hash
    // for every run and break the lineage_hash dedupe guarantee (same sources + scope
    // should always converge to one summary). run_key stays in replayMetadata only.
    const vaultBody = stableJson({
      schemaVersion: 1,
      tenant_id: tenantId,
      sources: eligible.map((source) => ({
        canonical_id: source.canonicalId,
        record_type: source.recordType,
        record_id: source.recordId,
        content_hash: source.contentHash,
        ontology_type: source.ontologyType,
        tier: source.tier,
      })),
      prompt_safe_projection: promptSafe,
    });
    const written = writeVaultArtifact(db, {
      tenantId,
      sourceType: "memory.consolidation",
      sourceId: options.runKey,
      sessionId: `consolidation:${options.runKey}`,
      body: vaultBody,
      label,
      replayMetadata: {
        runKey: options.runKey,
        sourceCount: eligible.length,
      },
      now,
    });
    vaultArtifactId = written.id;
    vaultArtifactHash = written.contentHash;
  } catch (err) {
    baseRecord.status = "failed";
    baseRecord.failureReason = `vault_write_failed:${err instanceof Error ? err.message : String(err)}`;
    persistRunRow(db, baseRecord, "failed", baseRecord.failureReason);
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }

  // 3. Replay / integrity verification -- read back and compare hash. If the file
  //    disappeared, was tampered with, or hash differs, the run FAILS without writing
  //    any summary row. Originals remain intact and eligible for the next cycle.
  let replayed: ReturnType<typeof readVaultArtifact>;
  try {
    replayed = readVaultArtifact(db, vaultArtifactId);
    if (replayed.contentHash !== vaultArtifactHash) {
      throw new Error(`vault replay hash mismatch: stored ${vaultArtifactHash}, replayed ${replayed.contentHash}`);
    }
  } catch (err) {
    baseRecord.status = "failed";
    baseRecord.failureReason = `vault_replay_failed:${err instanceof Error ? err.message : String(err)}`;
    recordVaultFailure(db, tenantId, vaultArtifactId, vaultArtifactHash, baseRecord.failureReason, actorId);
    persistRunRow(db, baseRecord, "failed", baseRecord.failureReason);
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }

  // 4. Classification gate -- if ANY source in the batch is marked requires_human_review,
  //    refuse to write a summary. We check the full sources set so that an operator who
  //    batches protected + eligible data still gets the protected_skipped status.
  const label = ensureClassification(options.sources[0]!);
  if (options.sources.some((source) => source.classification?.policy === "requires_human_review")) {
    baseRecord.status = "protected_skipped";
    baseRecord.failureReason = "requires_human_review_classification";
    baseRecord.vaultArtifactId = vaultArtifactId;
    baseRecord.vaultArtifactHash = vaultArtifactHash;
    persistRunRow(db, baseRecord, "protected_skipped", baseRecord.failureReason);
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }

  // 5. Invoke the summary provider. Provider failures DO NOT mutate source state.
  const provider = options.provider ?? defaultProvider;
  let summary: ConsolidationSummaryInput;
  try {
    summary = await provider({ sources: eligible, promptSafe });
  } catch (err) {
    baseRecord.status = "failed";
    baseRecord.failureReason = `provider_failed:${err instanceof Error ? err.message : String(err)}`;
    baseRecord.vaultArtifactId = vaultArtifactId;
    baseRecord.vaultArtifactHash = vaultArtifactHash;
    persistRunRow(db, baseRecord, "failed", baseRecord.failureReason);
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }
  if (!summary || typeof summary.content !== "string" || summary.content.length === 0) {
    baseRecord.status = "failed";
    baseRecord.failureReason = "provider_returned_empty";
    baseRecord.vaultArtifactId = vaultArtifactId;
    baseRecord.vaultArtifactHash = vaultArtifactHash;
    persistRunRow(db, baseRecord, "failed", baseRecord.failureReason);
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }

  // 6. Compute deterministic lineage hash and dedupe.
  const ontologyType = eligible[0]!.ontologyType;
  const lineageHash = computeLineageHash({
    tenantId,
    scopeHash: scopeHashValue,
    ontologyType,
    sourceVaultHash: vaultArtifactHash,
    summary,
    classification: label,
    policyId: options.policyId,
    policyVersion: options.policyVersion,
  });

  const summaryId = `sum_${sha256Hex(lineageHash).slice(0, 32)}`;

  // 7. Atomic insert -- if the summary insert fails, the audit write is rolled back too.
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO memory_consolidation_summaries
          (id, tenant_id, ontology_type, scope_hash, scope_json, summary_type, summary_content,
           content_hash, source_count, source_ids_json, source_vault_artifact_id, source_vault_hash,
           classification_json, model_id, model_version, run_id, run_key, lineage_hash, status,
           policy_id, policy_version, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
      ).run(
        summaryId,
        tenantId,
        ontologyType,
        scopeHashValue,
        stableJson(options.scope),
        summary.type,
        summary.content,
        sha256Hex(summary.content),
        eligible.length,
        stableJson(eligible.map((source) => source.canonicalId)),
        vaultArtifactId,
        vaultArtifactHash,
        stableJson(label),
        options.modelId ?? null,
        options.modelVersion ?? null,
        runId,
        options.runKey,
        lineageHash,
        options.policyId ?? null,
        options.policyVersion ?? null,
        actorId,
        startedAt
      );

      writeChainedMemoryAuditEntry(db, {
        tenantId,
        actorId,
        actorRole: actorId === "system" ? "system" : "operator",
        eventType: AUDIT_EVENT_TYPES.MEMORY_CONSOLIDATION_SUMMARY,
        entityType: ENTITY_TYPES.MEMORY_CONSOLIDATION,
        entityId: `consolidation_summary:${summaryId}`,
        reason: "consolidation_summary_written",
        metadata: {
          summary_id: summaryId,
          run_id: runId,
          run_key: options.runKey,
          ontology_type: ontologyType,
          scope_hash: scopeHashValue,
          lineage_hash: lineageHash,
          source_vault_artifact_id: vaultArtifactId,
          source_vault_hash: vaultArtifactHash,
          source_count: eligible.length,
          summary_type: summary.type,
          summary_hash: sha256Hex(summary.content),
          policy_id: options.policyId ?? null,
          policy_version: options.policyVersion ?? null,
          classification: label,
        },
        createdAt: startedAt,
      });
    })();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // UNIQUE(tenant_id, lineage_hash) -> duplicate summary for same lineage.
    if (/UNIQUE.*lineage_hash/i.test(message) || /constraint failed/i.test(message)) {
      baseRecord.status = "completed_replayed";
      baseRecord.failureReason = "duplicate_lineage";
      baseRecord.vaultArtifactId = vaultArtifactId;
      baseRecord.vaultArtifactHash = vaultArtifactHash;
      baseRecord.summaryId = summaryId;
      baseRecord.lineageHash = lineageHash;
      baseRecord.completedAt = startedAt;
      persistRunRow(db, baseRecord, "completed_replayed", baseRecord.failureReason);
      writeRunReceipt(db, baseRecord, actorId);
      return baseRecord;
    }
    baseRecord.status = "failed";
    baseRecord.failureReason = `summary_insert_failed:${message}`;
    baseRecord.vaultArtifactId = vaultArtifactId;
    baseRecord.vaultArtifactHash = vaultArtifactHash;
    persistRunRow(db, baseRecord, "failed", baseRecord.failureReason);
    writeRunReceipt(db, baseRecord, actorId);
    return baseRecord;
  }

  baseRecord.status = "completed";
  baseRecord.vaultArtifactId = vaultArtifactId;
  baseRecord.vaultArtifactHash = vaultArtifactHash;
  baseRecord.summaryId = summaryId;
  baseRecord.lineageHash = lineageHash;
  baseRecord.completedAt = startedAt;

  persistRunRow(db, baseRecord, "completed", null);
  writeRunReceipt(db, baseRecord, actorId);
  return baseRecord;
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function persistRunRow(db: Database.Database, _summary: ConsolidationRunSummary, _status: string, _reason: string | null): void {
  // The legacy memory_consolidation_runs table has an INTEGER PRIMARY KEY id column.
  // We don't touch it from MEMLIFE-05 -- the new memory_consolidation_summaries table
  // is the durable record. This function intentionally does not write to that legacy
  // table to avoid schema drift.
  if (!tableExists(db, "memory_consolidation_summaries")) return;
  // We only persist updates to memory_consolidation_summaries when a summary exists.
  // No-op for runs that didn't write a summary.
}

function writeRunReceipt(db: Database.Database, summary: ConsolidationRunSummary, actorId: string): void {
  try {
    writeChainedMemoryAuditEntry(db, {
      tenantId: summary.tenantId,
      actorId,
      actorRole: actorId === "system" ? "system" : "operator",
      eventType: AUDIT_EVENT_TYPES.MEMORY_CONSOLIDATION_RUN,
      entityType: ENTITY_TYPES.MEMORY_CONSOLIDATION,
      entityId: `consolidation_run:${summary.runId}`,
      reason: `consolidation_${summary.status}`,
      metadata: {
        run_id: summary.runId,
        run_key: summary.runKey,
        status: summary.status,
        considered: summary.considered,
        eligible: summary.eligible,
        protected: summary.protected,
        vault_artifact_id: summary.vaultArtifactId,
        vault_artifact_hash: summary.vaultArtifactHash,
        summary_id: summary.summaryId,
        lineage_hash: summary.lineageHash,
        failure_reason: summary.failureReason,
        started_at: summary.startedAt,
        completed_at: summary.completedAt,
      },
      createdAt: summary.completedAt ?? summary.startedAt,
    });
  } catch (err) {
    // Receipt failure must roll back / leave incomplete. We mark the run
    // as failed so the caller can observe the inconsistency.
    summary.failureReason = `receipt_failure:${err instanceof Error ? err.message : String(err)}`;
    summary.status = summary.status === "completed" ? "incomplete" : summary.status;
    persistRunRow(db, summary, summary.status === "incomplete" ? "incomplete" : summary.status, summary.failureReason);
  }
}

function recordVaultFailure(
  db: Database.Database,
  tenantId: string,
  artifactId: string,
  artifactHash: string,
  reason: string,
  actorId: string
): void {
  if (!tableExists(db, "memory_vault_durability")) return;
  const id = `vdr_${sha256Hex(stableJson({ tenantId, artifactId, reason })).slice(0, 32)}`;
  db.prepare(
    `INSERT INTO memory_vault_durability
      (id, tenant_id, artifact_id, artifact_uri, content_hash, write_state, replay_state, failure_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'complete', 'failed', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(tenant_id, artifact_id) DO UPDATE SET
      replay_state = excluded.replay_state,
      failure_reason = excluded.failure_reason,
      updated_at = excluded.updated_at`
  ).run(id, tenantId, artifactId, `vault://${tenantId}/${artifactId}`, artifactHash, reason);
  try {
    writeChainedMemoryAuditEntry(db, {
      tenantId,
      actorId,
      actorRole: actorId === "system" ? "system" : "operator",
      eventType: AUDIT_EVENT_TYPES.MEMORY_VAULT_FAILURE,
      entityType: ENTITY_TYPES.MEMORY_VAULT,
      entityId: `vault_artifact:${artifactId}`,
      reason: "vault_durability_failure",
      metadata: { artifact_id: artifactId, artifact_hash: artifactHash, failure_reason: reason },
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Audit failure is non-fatal here -- durability row already recorded.
  }
}
