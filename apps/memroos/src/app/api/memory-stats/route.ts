import type { NextRequest } from 'next/server';

import { getDb } from '@/lib/db';
import { authenticateUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/middleware-roles';
import { LOCAL_NOC_AGENT_IDS, normalizeNocWorkspace, type NocWorkspace } from '@/lib/noc-filters';
import {
  metricEnvelope,
  type MetricEnvelope,
  type MetricScope,
} from '@/lib/metric-status';

export const dynamic = 'force-dynamic';

const VALID_WINDOWS = ['day', 'week', 'month'] as const;
type StatsWindow = (typeof VALID_WINDOWS)[number];

interface ConsolidationRunRow {
  id: number;
  started_at: string;
  completed_at: string | null;
  batch_size: number;
  insights_written: number;
  status: 'completed' | 'failed' | 'running' | string;
  error_message: string | null;
}

function normalizeWindow(value: string | null): StatsWindow | null {
  return VALID_WINDOWS.includes(value as StatsWindow) ? (value as StatsWindow) : null;
}

function sinceForWindow(window: StatsWindow | null): string | null {
  if (!window) return null;
  const days = window === 'day' ? 1 : window === 'week' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function messageScope(alias: string, since: string | null, workspace: NocWorkspace) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (since) {
    conditions.push(`${alias}.timestamp >= ?`);
    params.push(since);
  }
  if (workspace !== 'all') {
    const localPlaceholders = LOCAL_NOC_AGENT_IDS.map(() => '?').join(', ');
    conditions.push(
      workspace === 'local'
        ? `LOWER(${alias}.agent_id) IN (${localPlaceholders})`
        : `LOWER(${alias}.agent_id) NOT IN (${localPlaceholders})`
    );
    params.push(...LOCAL_NOC_AGENT_IDS);
  }
  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function tryRead<T>(reader: () => T | undefined): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const value = reader();
    if (value === undefined || value === null) {
      return { ok: false, error: 'query returned no row' };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function buildPendingEnvelope(
  scope: MetricScope,
  since: string | null,
  workspace: NocWorkspace
): MetricEnvelope<number | null> {
  const db = getDb();
  const messageClause = messageScope('m', since, workspace);
  const result = tryRead(() =>
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM messages m ${
          messageClause.clause
            ? `${messageClause.clause} AND m.consolidated = 0`
            : 'WHERE m.consolidated = 0'
        }`
      )
      .get(...messageClause.params) as { cnt: number }
  );
  if (!result.ok) {
    return metricEnvelope<number | null>({
      value: null,
      status: 'error',
      source: 'sqlite://messages',
      observedAt: null,
      scope,
      reason: result.error,
    });
  }
  // Avoid classifyScalar()'s empty branch when we did count rows; treat
  // any positive COUNT(*) as live (even without a latestAt probe).
  const count = result.value.cnt;
  const status = count > 0 ? 'live' : 'zero';
  return metricEnvelope<number | null>({
    value: count,
    status,
    source: 'sqlite://messages',
    observedAt: new Date().toISOString(),
    scope,
    reason: count > 0
      ? `Counted ${count} unconsolidated message(s) for window=${scope.window} workspace=${scope.workspace}`
      : `No unconsolidated messages for window=${scope.window} workspace=${scope.workspace}`,
  });
}

function buildRecentFailuresEnvelope(scope: MetricScope): MetricEnvelope<number | null> {
  const db = getDb();
  const result = tryRead(() =>
    db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM memory_consolidation_runs WHERE status='failed' AND started_at >= datetime('now', '-24 hours')"
      )
      .get() as { cnt: number }
  );
  if (!result.ok) {
    return metricEnvelope<number | null>({
      value: null,
      status: 'error',
      source: 'sqlite://memory_consolidation_runs',
      observedAt: null,
      scope,
      reason: result.error,
    });
  }
  return metricEnvelope<number | null>({
    value: result.value.cnt,
    status: result.value.cnt === 0 ? 'zero' : 'live',
    source: 'sqlite://memory_consolidation_runs',
    observedAt: new Date().toISOString(),
    scope,
    reason:
      result.value.cnt === 0
        ? 'No failed consolidation runs in the last 24h'
        : `${result.value.cnt} failed consolidation run(s) in the last 24h`,
  });
}

function buildLastRunEnvelope(scope: MetricScope): { envelope: MetricEnvelope<number | null>; row: ConsolidationRunRow | null } {
  const db = getDb();
  const result = tryRead(() =>
    db
      .prepare(
        'SELECT id, started_at, completed_at, batch_size, insights_written, status, error_message FROM memory_consolidation_runs ORDER BY id DESC LIMIT 1'
      )
      .get() as ConsolidationRunRow | undefined
  );
  if (!result.ok || !result.value) {
    return {
      envelope: metricEnvelope<number | null>({
        value: null,
        status: 'unavailable',
        source: 'sqlite://memory_consolidation_runs',
        observedAt: null,
        scope,
        reason: result.ok ? 'No consolidation run has ever been recorded' : result.error,
      }),
      row: result.ok ? null : null,
    };
  }
  const row = result.value;
  const observedAt = row.completed_at ?? row.started_at;
  const status = (() => {
    if (row.status === 'failed') return 'degraded' as const;
    if (row.status === 'running') return 'degraded' as const;
    return 'live' as const;
  })();
  const reason = (() => {
    if (row.status === 'failed') return `Last consolidation run failed: ${row.error_message ?? 'no error message'}`;
    if (row.status === 'running') return 'Last consolidation run is still in progress';
    return `Last consolidation run completed at ${row.completed_at ?? 'unknown time'}`;
  })();
  return {
    envelope: metricEnvelope<number | null>({
      value: row.status === 'completed' ? row.insights_written : null,
      status,
      source: 'sqlite://memory_consolidation_runs',
      observedAt,
      scope,
      reason,
    }),
    row,
  };
}

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 });
  }
  const roleError = requireRole(session.role, 'operator');
  if (roleError) return roleError;

  const db = getDb();
  const url = req.nextUrl ?? new URL(req.url);
  const window = normalizeWindow(url.searchParams.get('window'));
  const workspace = normalizeNocWorkspace(url.searchParams.get('workspace'));
  const since = sinceForWindow(window);
  const scope: MetricScope = { window: window ?? 'all', workspace };
  const scopedMessages = messageScope('m', since, workspace);

  const pending = buildPendingEnvelope(scope, since, workspace);
  const recentFailures = buildRecentFailuresEnvelope(scope);
  const lastRun = buildLastRunEnvelope(scope);

  const tierStats = db
    .prepare(
      `SELECT ms.tier, COUNT(*) AS count, AVG(ms.salience_score) AS avg_score
       FROM memory_salience ms
       JOIN messages m ON m.id = ms.message_id
       ${scopedMessages.clause}
       GROUP BY ms.tier`
    )
    .all(...scopedMessages.params) as { tier: string; count: number; avg_score: number }[];

  // Source breakdown — count distinct agent_ids so the panel can show what was ingested
  const sourcesRows = db
    .prepare(`SELECT m.agent_id, COUNT(*) AS cnt FROM messages m ${scopedMessages.clause} GROUP BY m.agent_id ORDER BY cnt DESC`)
    .all(...scopedMessages.params) as { agent_id: string; cnt: number }[];

  const consolidationModel = process.env.CONSOLIDATION_MODEL ?? 'claude-haiku-4-5-20251001';

  return Response.json({
    lastRun: lastRun.row,
    pendingUnconsolidated: pending.value ?? 0,
    tierStats,
    consolidationModel,
    sources: sourcesRows,
    recentFailures24h: recentFailures.value ?? 0,
    metrics: {
      pendingUnconsolidated: pending,
      recentFailures24h: recentFailures,
      lastRun: lastRun.envelope,
    },
    timestamp: new Date().toISOString(),
  });
}
