import crypto from 'crypto';

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from '@/lib/audit/event-types';
import { writeAuditEntry } from '@/lib/audit/write';
import { getDb } from '../db';
import { activeLegalHoldsForRecord } from './retention-expiry';
import { parseJsonObject, scopeHash, sha256Hex, stableJson, type RetentionRecordRow, type RetentionScope } from './retention-policy';

let _started = false;
let _hasLogFn: boolean | null = null;

const DECAY_RATES: Record<string, number> = {
  high: 0.01,
  mid: 0.02,
  low: 0.05,
};

/**
 * Probes whether SQLite has a LOG() math function available.
 * Result is cached module-level after first call.
 * Exposed for test isolation via _resetForTest().
 */
export function hasLogFunction(): boolean {
  if (_hasLogFn === null) {
    try {
      getDb().prepare('SELECT LOG(1.0)').get();
      _hasLogFn = true;
    } catch {
      _hasLogFn = false;
    }
  }
  return _hasLogFn;
}

/**
 * Resets the LOG() probe cache for test isolation.
 */
export function _resetForTest(): void {
  _hasLogFn = null;
}

export interface DecayRunSummary {
  runKey: string;
  cycleId: string;
  tenantId: string;
  status: 'completed' | 'lease_held' | 'failed';
  considered: number;
  decayed: number;
  skippedPinned: number;
  skippedHeld: number;
  skippedProtected: number;
  skippedExempt: number;
  skippedNotDue: number;
  receipts: Array<{
    id: string;
    recordId: string;
    decision: 'decayed' | 'skipped';
    reason: string;
    beforeScore: number;
    afterScore: number;
  }>;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function tableExists(db: ReturnType<typeof getDb>, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function retentionRecordForMemory(db: ReturnType<typeof getDb>, tenantId: string, recordType: string, recordId: string): RetentionRecordRow | null {
  if (!tableExists(db, 'memory_retention_records')) return null;
  const row = db
    .prepare(
      `SELECT * FROM memory_retention_records
       WHERE tenant_id = ? AND record_type = ? AND record_id = ?
       ORDER BY updated_at DESC, id DESC LIMIT 1`
    )
    .get(tenantId, recordType, recordId) as RetentionRecordRow | undefined;
  return row ?? null;
}

function isProtectedByScope(scope: Record<string, unknown>): 'protected' | 'exempt' | null {
  if (scope.protected === true || scope.decayProtected === true || scope.decay_protected === true) return 'protected';
  if (scope.decayExempt === true || scope.decay_exempt === true || scope.policyExempt === true || scope.policy_exempt === true) return 'exempt';
  return null;
}

function matchesDecayScope(
  requestedScope: RetentionScope,
  recordScope: Record<string, unknown>,
  row: { record_id: string; record_type: string; project: string | null; agent_id: string | null; session_id: string | null }
): boolean {
  for (const [key, expected] of Object.entries(requestedScope)) {
    if (expected === undefined || expected === null || expected === '' || expected === '*') continue;
    if (key === 'tenantId' || key === 'purpose') continue;
    const actual =
      key === 'recordId'
        ? row.record_id
      : key === 'recordType'
          ? row.record_type
            : key === 'project'
              ? row.project
            : key === 'agentId'
              ? row.agent_id
              : key === 'sessionId'
                ? row.session_id
                : recordScope[key];
    if (Array.isArray(expected)) {
      if (expected.length === 0 || !expected.includes(actual)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function emitDecayReceipt(
  db: ReturnType<typeof getDb>,
  input: {
    tenantId: string;
    runKey: string;
    cycleId: string;
    recordType: string;
    recordId: string;
    decision: 'decayed' | 'skipped';
    reason: string;
    beforeScore: number;
    afterScore: number;
    scope: RetentionScope | Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }
): DecayRunSummary['receipts'][number] {
  const id = `decay_${sha256Hex(stableJson({ runKey: input.runKey, recordId: input.recordId, decision: input.decision, reason: input.reason })).slice(0, 32)}`;
  const hash = scopeHash(input.scope);
  if (tableExists(db, 'memory_decay_receipts')) {
    db.prepare(
      `INSERT OR IGNORE INTO memory_decay_receipts
        (id, tenant_id, run_key, cycle_id, record_type, record_id, decision, reason,
         before_score, after_score, scope_hash, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.tenantId,
      input.runKey,
      input.cycleId,
      input.recordType,
      input.recordId,
      input.decision,
      input.reason,
      input.beforeScore,
      input.afterScore,
      hash,
      stableJson(input.metadata ?? {}),
      input.createdAt
    );
  }
  return { id, recordId: input.recordId, decision: input.decision, reason: input.reason, beforeScore: input.beforeScore, afterScore: input.afterScore };
}

function computeDecayedScore(row: { salience_score: number; access_count: number }, tier: string, useLog: boolean): number {
  const rate = DECAY_RATES[tier];
  if (rate === undefined) return row.salience_score;
  const resistance = useLog ? 1.0 + Math.log10(1.0 + Math.max(0, row.access_count)) : 1.0;
  return Math.max(0.0, row.salience_score * (1.0 - rate / resistance));
}

/**
 * Runs a single decay cycle:
 * - Skips pinned tier entirely
 * - Applies one cycle per schedule period to scoped eligible episodic rows
 * - Skips active legal holds, protected rows, and decay/policy-exempt rows
 * - Uses the same access-resistance formula as the SQL path when LOG() exists
 * - Clamps salience_score to MIN 0.0
 *
 * Security: T-23-01 -- rates from hardcoded map, never user input
 */
export function runDecay(options: { tenantId?: string; runKey?: string; actorId?: string; scope?: RetentionScope; now?: Date } = {}): DecayRunSummary {
  const db = getDb();
  const tenantId = options.tenantId ?? 'default-tenant';
  const now = options.now ?? new Date();
  const nowIso = toIso(now);
  const scope = options.scope ?? { tenantId, purpose: 'recall' };
  const hash = scopeHash(scope);
  const cycleId = nowIso.slice(0, 10);
  const runKey = options.runKey ?? `decay:${tenantId}:${cycleId}:${hash.slice(0, 12)}`;
  const actorId = options.actorId ?? 'system';
  const useLog = hasLogFunction();

  if (tableExists(db, 'memory_decay_runs')) {
    const existing = db.prepare('SELECT run_key, status, summary_json FROM memory_decay_runs WHERE run_key = ?').get(runKey) as { run_key: string; status: string; summary_json: string } | undefined;
    if (existing?.status === 'completed') {
      const prior = JSON.parse(existing.summary_json || '{}') as DecayRunSummary;
      return { ...prior, status: 'lease_held', receipts: [] };
    }
  }

  const rows = db
    .prepare(
      `SELECT s.id, s.message_id, s.record_type,
              COALESCE(s.record_id, CAST(s.message_id AS TEXT)) AS record_id,
              s.tier, s.salience_score, s.access_count, s.last_decay_at,
              m.project AS message_project, m.agent_id AS message_agent_id,
              m.session_id AS message_session_id, m.policy AS message_policy,
              m.visibility AS message_visibility,
              w.agent_id AS write_agent_id, w.metadata AS write_metadata,
              c.agent_id AS candidate_agent_id, c.metadata_json AS candidate_metadata,
              cap.session_id AS candidate_session_id
       FROM memory_salience s
       LEFT JOIN messages m ON s.record_type = 'message' AND m.id = s.message_id
       LEFT JOIN agent_memory_writes w
         ON s.record_type = 'agent_memory_write' AND CAST(s.record_id AS INTEGER) = w.id
       LEFT JOIN agent_memory_candidates c
         ON s.record_type = 'agent_memory_candidate' AND c.id = s.record_id
       LEFT JOIN agent_session_captures cap ON c.capture_id = cap.id
       WHERE date(s.last_decay_at) < date(?)
       ORDER BY s.record_type ASC, record_id ASC`
    )
    .all(nowIso) as Array<{
    id: number;
    message_id: number | null;
    record_type: string;
    record_id: string;
    tier: string;
    salience_score: number;
    access_count: number;
    last_decay_at: string;
    message_project: string | null;
    message_agent_id: string | null;
    message_session_id: string | null;
    message_policy: string | null;
    message_visibility: string | null;
    write_agent_id: string | null;
    write_metadata: string | null;
    candidate_agent_id: string | null;
    candidate_metadata: string | null;
    candidate_session_id: string | null;
  }>;

  const summary: DecayRunSummary = {
    runKey,
    cycleId,
    tenantId,
    status: 'completed',
    considered: 0,
    decayed: 0,
    skippedPinned: 0,
    skippedHeld: 0,
    skippedProtected: 0,
    skippedExempt: 0,
    skippedNotDue: 0,
    receipts: [],
  };

  try {
    for (const row of rows) {
      const recordId = row.record_id;
      const metadata = parseJsonObject(row.write_metadata ?? row.candidate_metadata ?? null);
      const project = row.message_project ?? (typeof metadata.project === 'string' ? metadata.project : null);
      const agentId = row.message_agent_id ?? row.write_agent_id ?? row.candidate_agent_id;
      const sessionId = row.message_session_id ?? row.candidate_session_id;
      const policy = row.message_policy ?? (typeof metadata.policy === 'string' ? metadata.policy : null);
      const visibility = row.message_visibility ?? (typeof metadata.visibility === 'string' ? metadata.visibility : null);
      const scopeRow = { record_id: recordId, record_type: row.record_type, project, agent_id: agentId, session_id: sessionId };
      const retention = retentionRecordForMemory(db, tenantId, row.record_type, recordId);
      const recordScope = retention
        ? parseJsonObject(retention.scope_json)
        : { tenantId, recordType: row.record_type, recordId, project, agentId, sessionId, policy, visibility };
      if (!matchesDecayScope(scope, recordScope, scopeRow)) continue;
      summary.considered += 1;
      const receiptBase = { tenantId, runKey, cycleId, recordType: row.record_type, recordId, beforeScore: row.salience_score, scope: recordScope, createdAt: nowIso };

      if (row.tier === 'pinned') {
        summary.skippedPinned += 1;
        summary.receipts.push(emitDecayReceipt(db, { ...receiptBase, decision: 'skipped', reason: 'pinned', afterScore: row.salience_score }));
        continue;
      }

      const protection = isProtectedByScope(recordScope);
      if (protection === 'protected') {
        summary.skippedProtected += 1;
        summary.receipts.push(emitDecayReceipt(db, { ...receiptBase, decision: 'skipped', reason: 'protected', afterScore: row.salience_score }));
        continue;
      }
      if (protection === 'exempt') {
        summary.skippedExempt += 1;
        summary.receipts.push(emitDecayReceipt(db, { ...receiptBase, decision: 'skipped', reason: 'policy_exempt', afterScore: row.salience_score }));
        continue;
      }

      if (retention) {
        const holds = activeLegalHoldsForRecord(db, retention, now);
        if (holds.length > 0) {
          summary.skippedHeld += 1;
          summary.receipts.push(
            emitDecayReceipt(db, {
              ...receiptBase,
              decision: 'skipped',
              reason: 'active_legal_hold',
              afterScore: row.salience_score,
              metadata: { hold_ids: holds.map((hold) => hold.id) },
            })
          );
          continue;
        }
      }

      const afterScore = computeDecayedScore({ salience_score: row.salience_score, access_count: asNumber(row.access_count) }, row.tier, useLog);
      db.prepare('UPDATE memory_salience SET salience_score = ?, last_decay_at = ? WHERE id = ?').run(afterScore, nowIso, row.id);
      summary.decayed += 1;
      summary.receipts.push(emitDecayReceipt(db, { ...receiptBase, decision: 'decayed', reason: `tier_${row.tier}`, afterScore }));
    }

    if (tableExists(db, 'memory_decay_runs')) {
      db.prepare(
        `INSERT INTO memory_decay_runs
          (run_key, tenant_id, cycle_id, status, scope_json, scope_hash, actor_id, scheduled_for,
           started_at, completed_at, summary_json)
         VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_key) DO UPDATE SET
           status = excluded.status,
           completed_at = excluded.completed_at,
           summary_json = excluded.summary_json`
      ).run(runKey, tenantId, cycleId, stableJson(scope), hash, actorId, nowIso, nowIso, nowIso, stableJson({ ...summary, receipts: summary.receipts.map((receipt) => receipt.id) }));
    }

    writeAuditEntry(
      {
        tenant_id: tenantId,
        actor_id: actorId,
        actor_role: actorId === 'system' ? 'system' : 'operator',
        event_type: AUDIT_EVENT_TYPES.MEMORY_DECAY_RUN,
        entity_type: ENTITY_TYPES.MEMORY_DECAY,
        entity_id: `memory_decay_run:${runKey}`,
        reason: 'memory_decay_completed',
        metadata_json: {
          run_key: runKey,
          cycle_id: cycleId,
          scope_hash: hash,
          considered: summary.considered,
          decayed: summary.decayed,
          skipped_pinned: summary.skippedPinned,
          skipped_held: summary.skippedHeld,
          skipped_protected: summary.skippedProtected,
          skipped_exempt: summary.skippedExempt,
        },
        created_at: nowIso,
      },
      db
    );

    console.log('[decay] cycle complete');
    return summary;
  } catch (err) {
    summary.status = 'failed';
    if (tableExists(db, 'memory_decay_runs')) {
      db.prepare(
        `INSERT INTO memory_decay_runs
          (run_key, tenant_id, cycle_id, status, scope_json, scope_hash, actor_id, scheduled_for,
           started_at, completed_at, summary_json)
         VALUES (?, ?, ?, 'failed', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_key) DO UPDATE SET status = excluded.status, completed_at = excluded.completed_at, summary_json = excluded.summary_json`
      ).run(runKey, tenantId, cycleId, stableJson(scope), hash, actorId, nowIso, nowIso, nowIso, stableJson({ error_hash: crypto.createHash('sha256').update(err instanceof Error ? err.message : String(err)).digest('hex'), ...summary, receipts: [] }));
    }
    return summary;
  }
}

/**
 * Starts the decay scheduler (runs immediately, then every 60 min).
 * Module-level _started guard prevents double-start.
 */
export function startDecayScheduler(): void {
  if (_started) return;
  _started = true;
  console.log('[decay] scheduler started (interval: 60m)');
  runDecay();
  setInterval(runDecay, 60 * 60 * 1000);
}
