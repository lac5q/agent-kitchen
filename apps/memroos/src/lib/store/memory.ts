/**
 * Persistence for memory-owned SQLite tables.
 *
 * STORE-04: memory evaluation and trace tables are kept behind the store
 * boundary. Reads intentionally do not require governance; every schema or
 * row write does.
 */

import type Database from "better-sqlite3";

import {
  assertGovernance,
  systemGovernance,
  type GovernanceContext,
} from "@/lib/store/governance";

export type MemoryDatabase = Database.Database;

export interface MemoryEvalResultRecord {
  caseId: string;
  layer: string;
  scenario: string;
  agentId: string;
  taskPrompt: string;
  passed: boolean;
  failures: string[];
  metrics: unknown;
  tiers: unknown;
  retrieved: unknown;
  trace: unknown;
}

export interface MemoryEvalRunRecord {
  id: string;
  mode: string;
  status: string;
  summary: unknown;
  startedAt: string;
  completedAt: string;
  results: MemoryEvalResultRecord[];
}

export interface MemoryEvalRunRow {
  id: string;
  mode: string;
  status: string;
  summary: string;
  started_at: string;
  completed_at: string;
}

export interface MemoryEvalResultRow {
  case_id: string;
  passed: number;
  failures: string;
  metrics: string;
  tiers: string;
  retrieved: string;
  trace: string;
}

export interface MemoryEvalPersistence {
  run: MemoryEvalRunRow;
  results: MemoryEvalResultRow[];
}

export interface MemoryTraceStoreInput {
  id: string;
  tenantId: string;
  taskId: string | null;
  agentId: string | null;
  runId: string;
  causalPathJson: string;
  failureClassification: string | null;
  rootCause: string | null;
  replayHandle: string | null;
  proposedRepair: string | null;
  createdAt: string;
}

/** Governance context for a persisted memory-evaluation run. */
export function memoryEvalGovernance(run: Pick<MemoryEvalRunRecord, "id">): GovernanceContext {
  return systemGovernance(
    "memory.eval.write",
    `memory_eval_runs/${run.id}`,
    "persist the memory evaluation result",
  );
}

/** Governance context for a persisted causal memory trace. */
export function memoryTraceGovernance(
  input: Pick<MemoryTraceStoreInput, "runId" | "agentId">,
): GovernanceContext {
  return {
    actor: input.agentId ?? "system",
    action: "memory.trace.write",
    asset: `agent_memory_traces/${input.runId}`,
    purpose: "persist the memory retrieval trace",
    label: {
      visibility: "private",
      domain: "memory",
      sensitivity: "high",
      policy: "sealed",
    },
    decision: "allow",
  };
}

/** Create the memory-evaluation tables and indexes. */
export function ensureMemoryEvalTables(
  db: Database.Database,
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_eval_runs (
      id           TEXT PRIMARY KEY,
      mode         TEXT NOT NULL,
      status       TEXT NOT NULL CHECK(status IN ('passed','failed')),
      summary      TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_eval_cases (
      id          TEXT PRIMARY KEY,
      layer       TEXT NOT NULL,
      scenario    TEXT NOT NULL,
      agent_id    TEXT NOT NULL,
      task_prompt TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE IF NOT EXISTS memory_eval_results (
      id         INTEGER PRIMARY KEY,
      run_id     TEXT NOT NULL REFERENCES memory_eval_runs(id) ON DELETE CASCADE,
      case_id    TEXT NOT NULL,
      passed     INTEGER NOT NULL,
      failures   TEXT NOT NULL,
      metrics    TEXT NOT NULL,
      tiers      TEXT NOT NULL,
      retrieved  TEXT NOT NULL,
      trace      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS memory_eval_runs_completed
      ON memory_eval_runs(completed_at DESC);
    CREATE INDEX IF NOT EXISTS memory_eval_results_run
      ON memory_eval_results(run_id);
  `);
}

/** Persist one complete memory-evaluation run atomically. */
export function writeMemoryEvalRun(
  db: Database.Database,
  run: MemoryEvalRunRecord,
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  ensureMemoryEvalTables(db, governance);

  const insertCase = db.prepare(`
    INSERT INTO memory_eval_cases (id, layer, scenario, agent_id, task_prompt, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      layer=excluded.layer,
      scenario=excluded.scenario,
      agent_id=excluded.agent_id,
      task_prompt=excluded.task_prompt,
      updated_at=excluded.updated_at
  `);
  const insertResult = db.prepare(`
    INSERT INTO memory_eval_results (run_id, case_id, passed, failures, metrics, tiers, retrieved, trace)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO memory_eval_runs (id, mode, status, summary, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.mode,
      run.status,
      JSON.stringify(run.summary),
      run.startedAt,
      run.completedAt,
    );

    for (const result of run.results) {
      insertCase.run(
        result.caseId,
        result.layer,
        result.scenario,
        result.agentId,
        result.taskPrompt,
        run.completedAt,
      );
      insertResult.run(
        run.id,
        result.caseId,
        result.passed ? 1 : 0,
        JSON.stringify(result.failures),
        JSON.stringify(result.metrics),
        JSON.stringify(result.tiers),
        JSON.stringify(result.retrieved),
        JSON.stringify(result.trace),
      );
    }
  })();
}

/** Read the latest persisted memory-evaluation run. */
export function readLatestMemoryEvalRun(db: Database.Database): MemoryEvalPersistence | null {
  const run = db
    .prepare(
      "SELECT id, mode, status, summary, started_at, completed_at FROM memory_eval_runs ORDER BY completed_at DESC LIMIT 1",
    )
    .get() as MemoryEvalRunRow | undefined;

  if (!run) return null;

  const results = db
    .prepare(
      "SELECT case_id, passed, failures, metrics, tiers, retrieved, trace FROM memory_eval_results WHERE run_id = ? ORDER BY id ASC",
    )
    .all(run.id) as MemoryEvalResultRow[];

  return { run, results };
}

/** Insert one causal memory trace. */
export function writeMemoryTrace(
  db: Database.Database,
  input: MemoryTraceStoreInput,
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  db.prepare(
    `INSERT INTO agent_memory_traces (
       id, tenant_id, task_id, agent_id, run_id, causal_path_json,
       failure_classification, root_cause, replay_handle, proposed_repair, created_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?
     )`,
  ).run(
    input.id,
    input.tenantId,
    input.taskId,
    input.agentId,
    input.runId,
    input.causalPathJson,
    input.failureClassification,
    input.rootCause,
    input.replayHandle,
    input.proposedRepair,
    input.createdAt,
  );
}

/** Read the latest causal memory trace for a tenant/run pair. */
export function readMemoryTrace(
  db: Database.Database,
  tenantId: string,
  runId: string,
): Record<string, unknown> | null {
  return (db
    .prepare(
      `SELECT * FROM agent_memory_traces
       WHERE tenant_id = ? AND run_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(tenantId, runId) as Record<string, unknown> | undefined) ?? null;
}

/** Read recent traces associated with a goal or task. Reads do not require governance. */
export function listMemoryTracesForContext(
  db: Database.Database,
  tenantId: string,
  goalId: string,
  limit = 25,
): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT * FROM agent_memory_traces
       WHERE tenant_id = ? AND (run_id = ? OR task_id = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(tenantId, goalId, goalId, limit) as Array<Record<string, unknown>>;
}

/** Read recent memory candidates associated with a goal or task. */
export function listMemoryCandidatesForContext(
  db: Database.Database,
  tenantId: string,
  goalId: string,
  limit = 25,
): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT id, memory_type, content_hash, status, metadata_json, belief_stage, created_at
       FROM agent_memory_candidates
       WHERE tenant_id = ?
         AND (
           json_extract(metadata_json, '$.goalId') = ?
           OR json_extract(metadata_json, '$.goal_id') = ?
           OR json_extract(metadata_json, '$.taskId') = ?
           OR json_extract(metadata_json, '$.task_id') = ?
         )
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(tenantId, goalId, goalId, goalId, goalId, limit) as Array<Record<string, unknown>>;
}

export interface BeliefPromotionCandidateRow {
  id: string;
  tenant_id: string;
  metadata_json: string;
  created_at: string;
}

/** Read the silver candidates eligible for the belief-promotion scheduler. */
export function listBeliefPromotionCandidates(
  db: MemoryDatabase,
  cutoff: string,
  limit: number,
): BeliefPromotionCandidateRow[] {
  return db
    .prepare(
      `SELECT id, tenant_id, metadata_json, created_at
         FROM agent_memory_candidates
        WHERE belief_stage = 'silver_candidate_claim'
          AND status = 'candidate'
          AND created_at <= ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?`,
    )
    .all(cutoff, limit) as BeliefPromotionCandidateRow[];
}

/** Read whether the polymorphic salience table is available. */
export function memorySalienceTableExists(db: MemoryDatabase): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_salience'")
    .get() as { name: string } | undefined;
  return Boolean(row);
}

export interface MemorySalienceTarget {
  recordType: string;
  recordId: string;
}

/** Initialize salience for one memory-owned record. */
export function initializeMemorySalience(
  db: MemoryDatabase,
  input: {
    recordType: string;
    recordId: string;
    tier: string;
    score: number;
  },
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  db.prepare(
    `INSERT OR IGNORE INTO memory_salience (message_id, record_type, record_id, tier, salience_score)
     VALUES (NULL, ?, ?, ?, ?)`,
  ).run(input.recordType, input.recordId, input.tier, input.score);
}

/** Apply one usefulness delta to each named memory salience target. */
export function reinforceMemorySalience(
  db: MemoryDatabase,
  targets: MemorySalienceTarget[],
  delta: number,
  governance: GovernanceContext,
): number {
  assertGovernance(governance);
  let changed = 0;
  for (const target of targets) {
    const result = db.prepare(
      `UPDATE memory_salience
       SET salience_score = MIN(1.0, MAX(0.0, salience_score + ?)),
           tier = CASE
             WHEN MIN(1.0, MAX(0.0, salience_score + ?)) >= 0.8 THEN 'high'
             WHEN MIN(1.0, MAX(0.0, salience_score + ?)) >= 0.5 THEN 'mid'
             ELSE 'low'
           END,
           access_count = access_count + 1,
           last_accessed = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE record_type = ? AND record_id = ?`,
    ).run(delta, delta, delta, target.recordType, target.recordId);
    changed += Number(result.changes ?? 0);
  }
  return changed;
}

export interface MemoryEnrichmentCaptureRow {
  id: string;
  tenant_id: string;
  source_agent_id: string;
  raw_artifact_id: string | null;
  captured_at: string;
  metadata_json: string;
  updated_at: string;
}

/** Read governed-memory captures in queue order. */
export function listMemoryEnrichmentCaptures(
  db: MemoryDatabase,
): MemoryEnrichmentCaptureRow[] {
  return db
    .prepare(
      `SELECT id, tenant_id, source_agent_id, raw_artifact_id, captured_at, metadata_json, updated_at
       FROM agent_session_captures
       WHERE status = 'captured'
         AND raw_artifact_id IS NOT NULL
         AND metadata_json LIKE '%"enrichmentKind":"governed-memory"%'
       ORDER BY captured_at ASC, id ASC`,
    )
    .all() as MemoryEnrichmentCaptureRow[];
}

/** Read one governed-memory capture, including the full capture row. */
export function getMemoryEnrichmentCapture(
  db: MemoryDatabase,
  captureId: string,
): MemoryEnrichmentCaptureRow | undefined {
  return db
    .prepare("SELECT * FROM agent_session_captures WHERE id = ?")
    .get(captureId) as MemoryEnrichmentCaptureRow | undefined;
}

/** Insert one governed-memory bronze capture queue item. */
export function createMemoryEnrichmentCapture(
  db: MemoryDatabase,
  input: {
    id: string;
    tenantId: string;
    sourceAgentId: string;
    project: string | null;
    sessionId: string;
    summary: string;
    metadataJson: string;
    rawArtifactId: string;
    captureHash: string;
    capturedAt: string;
    updatedAt: string;
  },
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  db.prepare(
    `INSERT INTO agent_session_captures (
       id, tenant_id, source_agent_id, runtime, project, session_id, status,
       capture_health, summary, metadata_json, raw_artifact_id, capture_hash,
       captured_at, updated_at
     ) VALUES (?, ?, ?, 'governed-memory', ?, ?, 'captured', 'ok', ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.tenantId,
    input.sourceAgentId,
    input.project,
    input.sessionId,
    input.summary,
    input.metadataJson,
    input.rawArtifactId,
    input.captureHash,
    input.capturedAt,
    input.updatedAt,
  );
}

/** Update queue metadata and status for one governed-memory capture. */
export function updateMemoryEnrichmentCapture(
  db: MemoryDatabase,
  input: {
    captureId: string;
    metadataJson: string;
    status: "captured" | "handoff_ready";
    updatedAt: string;
  },
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  db.prepare(
    `UPDATE agent_session_captures
     SET status = ?, metadata_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(input.status, input.metadataJson, input.updatedAt, input.captureId);
}

/** Read the result payload for one memory write. */
export function getMemoryWriteResult(
  db: MemoryDatabase,
  writeId: number,
): { result: string } | undefined {
  return db
    .prepare("SELECT result FROM agent_memory_writes WHERE id = ?")
    .get(writeId) as { result: string } | undefined;
}

/** Persist the updated result payload for one memory write. */
export function updateMemoryWriteResult(
  db: MemoryDatabase,
  writeId: number,
  resultJson: string,
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  db.prepare("UPDATE agent_memory_writes SET result = ? WHERE id = ?").run(resultJson, writeId);
}

/** Insert one extracted silver memory candidate and return its change count. */
export function createMemoryCandidate(
  db: MemoryDatabase,
  input: {
    id: string;
    tenantId: string;
    captureId: string;
    agentId: string;
    memoryType: string;
    content: string;
    contentHash: string;
    metadataJson: string;
  },
  governance: GovernanceContext,
): number {
  assertGovernance(governance);
  const result = db.prepare(
    `INSERT OR IGNORE INTO agent_memory_candidates
      (id, tenant_id, capture_id, agent_id, memory_type, content, content_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.tenantId,
    input.captureId,
    input.agentId,
    input.memoryType,
    input.content,
    input.contentHash,
    input.metadataJson,
  );
  return Number(result.changes ?? 0);
}

/** Find an existing candidate for an idempotent enrichment retry. */
export function findMemoryCandidateByCaptureHash(
  db: MemoryDatabase,
  captureId: string,
  contentHash: string,
): { id: string } | undefined {
  return db
    .prepare(
      "SELECT id FROM agent_memory_candidates WHERE capture_id = ? AND content_hash = ?",
    )
    .get(captureId, contentHash) as { id: string } | undefined;
}

/** Run the governed-memory claim/enrichment mutations in one SQLite transaction. */
export function withMemoryEnrichmentTransaction<T>(
  db: MemoryDatabase,
  governance: GovernanceContext,
  operation: () => T,
): T {
  assertGovernance(governance);
  return db.transaction(operation)();
}
