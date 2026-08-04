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
