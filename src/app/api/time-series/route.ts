import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { readFileSync } from 'node:fs';
import { SKILL_CONTRIBUTIONS_LOG, FAILURES_LOG } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const VALID_METRICS = [
  'docs_ingested',
  'memory_writes',
  'recall_queries',
  'collection_growth',
  'skill_executions',
  'skill_failures',
] as const;
type Metric = (typeof VALID_METRICS)[number];

const VALID_WINDOWS = ['day', 'week', 'month'] as const;
type Window = (typeof VALID_WINDOWS)[number];

interface TimePoint {
  bucket: string;
  value: number;
}

// ─── SQL window config ────────────────────────────────────────────────────────
// `since` is a SQLite datetime expression embedded directly in SQL (not a user
// value — it's a hardcoded constant selected from a validated allowlist, so
// interpolation is safe per T-25-02).

interface SqlWindowConfig {
  since: string;
  bucketFormat: string;
}

function getWindowConfig(window: Window): SqlWindowConfig {
  switch (window) {
    case 'day':
      return { since: "datetime('now', '-1 day')", bucketFormat: '%H:00' };
    case 'week':
      return { since: "datetime('now', '-7 days')", bucketFormat: '%Y-%m-%d' };
    case 'month':
      return { since: "datetime('now', '-30 days')", bucketFormat: '%Y-%m-%d' };
  }
}

// ─── JS window config (for JSONL parsing) ────────────────────────────────────

interface JsWindowConfig {
  since: Date;
  bucketFn: (d: Date) => string;
}

function getJsWindowConfig(window: Window): JsWindowConfig {
  switch (window) {
    case 'day':
      return {
        since: new Date(Date.now() - 86400000),
        bucketFn: (d: Date) => d.toISOString().slice(11, 13) + ':00',
      };
    case 'week':
      return {
        since: new Date(Date.now() - 7 * 86400000),
        bucketFn: (d: Date) => d.toISOString().slice(0, 10),
      };
    case 'month':
      return {
        since: new Date(Date.now() - 30 * 86400000),
        bucketFn: (d: Date) => d.toISOString().slice(0, 10),
      };
  }
}

// ─── JSONL bucketing helper ───────────────────────────────────────────────────

function parseJsonlBuckets(filePath: string, window: Window): TimePoint[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const cfg = getJsWindowConfig(window);
  const sinceDate = cfg.since;
  const counts = new Map<string, number>();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const ts = (entry.timestamp ?? entry.ts) as string | undefined;
      if (!ts) continue;
      const d = new Date(ts);
      if (d < sinceDate) continue;
      const bucket = cfg.bucketFn(d);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    } catch {
      continue;
    }
  }
  return Array.from(counts.entries())
    .map(([bucket, value]) => ({ bucket, value }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const metricParam = url.searchParams.get('metric') ?? '';
  const windowParam = url.searchParams.get('window') ?? '';

  // Validate metric against allowlist (T-25-01, T-25-02)
  if (!VALID_METRICS.includes(metricParam as Metric)) {
    return Response.json({ error: 'Invalid metric' }, { status: 400 });
  }

  // Validate window against allowlist
  if (!VALID_WINDOWS.includes(windowParam as Window)) {
    return Response.json({ error: 'Invalid window' }, { status: 400 });
  }

  const metric = metricParam as Metric;
  const window = windowParam as Window;
  // since is a hardcoded SQLite expression (validated above) — safe to interpolate
  const { since, bucketFormat } = getWindowConfig(window);

  let points: TimePoint[] = [];

  switch (metric) {
    case 'docs_ingested': {
      const db = getDb();
      // bucketFormat is a bound parameter; since is a hardcoded datetime expression
      points = db.prepare<[string]>(`
        SELECT strftime(?, ingested_at) AS bucket, COUNT(*) AS value
        FROM ingest_meta
        WHERE ingested_at >= ${since}
        GROUP BY bucket
        ORDER BY bucket
      `).all(bucketFormat) as TimePoint[];
      break;
    }

    case 'memory_writes': {
      const db = getDb();
      points = db.prepare<[string]>(`
        SELECT strftime(?, completed_at) AS bucket, SUM(insights_written) AS value
        FROM memory_consolidation_runs
        WHERE completed_at IS NOT NULL AND completed_at >= ${since}
        GROUP BY bucket
        ORDER BY bucket
      `).all(bucketFormat) as TimePoint[];
      break;
    }

    case 'recall_queries': {
      const db = getDb();
      points = db.prepare<[string]>(`
        SELECT strftime(?, timestamp) AS bucket, COUNT(*) AS value
        FROM recall_log
        WHERE timestamp >= ${since}
        GROUP BY bucket
        ORDER BY bucket
      `).all(bucketFormat) as TimePoint[];
      break;
    }

    case 'collection_growth': {
      const db = getDb();
      points = db.prepare<[string]>(`
        SELECT strftime(?, ingested_at) AS bucket, COUNT(DISTINCT file_path) AS value
        FROM ingest_meta
        WHERE ingested_at >= ${since}
        GROUP BY bucket
        ORDER BY bucket
      `).all(bucketFormat) as TimePoint[];
      break;
    }

    case 'skill_executions': {
      points = parseJsonlBuckets(SKILL_CONTRIBUTIONS_LOG, window);
      break;
    }

    case 'skill_failures': {
      points = parseJsonlBuckets(FAILURES_LOG, window);
      break;
    }
  }

  return Response.json({
    points,
    metric,
    window,
    timestamp: new Date().toISOString(),
  });
}
