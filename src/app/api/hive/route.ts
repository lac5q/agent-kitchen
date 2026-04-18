import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { scanContent } from '@/lib/content-scanner';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const VALID_ACTION_TYPES = ['continue', 'loop', 'checkpoint', 'trigger', 'stop', 'error'] as const;
const VALID_STATUSES = ['pending', 'active', 'paused', 'completed', 'failed'] as const;

/**
 * GET /api/hive
 * Query params:
 *   agent  — filter by agent_id
 *   q      — FTS5 keyword search (wrapped in try/catch for malformed queries)
 *   limit  — max rows (default 20)
 *   type   — 'action' (default) | 'delegation'
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agent = url.searchParams.get('agent') ?? '';
  const q = url.searchParams.get('q') ?? '';
  const limit = Math.max(1, Number(url.searchParams.get('limit') ?? '20') || 20);
  const type = url.searchParams.get('type') ?? 'action';
  const timestamp = new Date().toISOString();
  const db = getDb();

  if (type === 'delegation') {
    const rows = agent
      ? db
          .prepare(
            `SELECT * FROM hive_delegations WHERE to_agent = ? ORDER BY created_at DESC LIMIT ?`
          )
          .all(agent, limit)
      : db
          .prepare(`SELECT * FROM hive_delegations ORDER BY created_at DESC LIMIT ?`)
          .all(limit);
    return Response.json({ delegations: rows, timestamp });
  }

  // FTS keyword search
  if (q.trim()) {
    const ftsQ = q
      .trim()
      .split(/\s+/)
      .map((w) => `${w}*`)
      .join(' ');
    try {
      const rows = agent
        ? db
            .prepare(
              `SELECT a.* FROM hive_actions a
               JOIN hive_actions_fts f ON a.id = f.rowid
               WHERE f.hive_actions_fts MATCH ? AND a.agent_id = ?
               ORDER BY a.timestamp DESC LIMIT ?`
            )
            .all(ftsQ, agent, limit)
        : db
            .prepare(
              `SELECT a.* FROM hive_actions a
               JOIN hive_actions_fts f ON a.id = f.rowid
               WHERE f.hive_actions_fts MATCH ?
               ORDER BY a.timestamp DESC LIMIT ?`
            )
            .all(ftsQ, limit);
      return Response.json({ actions: rows, timestamp });
    } catch {
      // T-20-02: Return empty results for malformed FTS syntax rather than 500
      return Response.json({ actions: [], timestamp });
    }
  }

  // Agent filter only, or default all
  const rows = agent
    ? db
        .prepare(
          `SELECT * FROM hive_actions WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?`
        )
        .all(agent, limit)
    : db
        .prepare(`SELECT * FROM hive_actions ORDER BY timestamp DESC LIMIT ?`)
        .all(limit);
  return Response.json({ actions: rows, timestamp });
}

/**
 * POST /api/hive
 * Action body:     { agent_id, action_type, summary, artifacts?, session_id? }
 * Delegation body: { type: 'delegation', task_id, from_agent, to_agent, task_summary, priority?, status?, checkpoint? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  if (body.type === 'delegation') {
    if (body.status && !(VALID_STATUSES as readonly string[]).includes(body.status)) {
      return Response.json(
        { error: `Invalid status: ${body.status}. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // SEC-01: Scan delegation task_summary before DB write
    const delegationScan = scanContent(body.task_summary ?? '');
    const delegationAuditAction = delegationScan.blocked
      ? 'content_blocked'
      : delegationScan.matches.length > 0
        ? 'content_flagged'
        : 'hive_delegation_upsert';
    writeAuditLog(db, {
      actor: body.from_agent ?? 'unknown',
      action: delegationAuditAction,
      target: 'hive_delegations',
      detail: delegationScan.matches.length > 0
        ? JSON.stringify(delegationScan.matches.map(m => m.patternName))
        : null,
      severity: delegationScan.blocked ? 'high' : delegationScan.matches.length > 0 ? 'medium' : 'info',
    });
    if (delegationScan.blocked) {
      return Response.json({ error: 'Content blocked by security scanner' }, { status: 403 });
    }

    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint)
       VALUES (@task_id, @from_agent, @to_agent, @task_summary, @priority, @status, @checkpoint)
       ON CONFLICT(task_id) DO UPDATE SET
         status     = excluded.status,
         checkpoint = excluded.checkpoint,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
    ).run({
      task_id: body.task_id,
      from_agent: body.from_agent,
      to_agent: body.to_agent,
      task_summary: delegationScan.cleanContent,
      priority: body.priority ?? 5,
      status: body.status ?? 'pending',
      checkpoint: body.checkpoint ? JSON.stringify(body.checkpoint) : null,
    });
    return Response.json({ ok: true, task_id: body.task_id });
  }

  // Default: write action
  // T-20-01: Validate action_type against allowlist (CHECK constraint is the safety net)
  if (!(VALID_ACTION_TYPES as readonly string[]).includes(body.action_type)) {
    return Response.json(
      {
        error: `Invalid action_type: "${body.action_type}". Must be one of: ${VALID_ACTION_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // SEC-01: Scan action summary before DB write
  const scan = scanContent(body.summary ?? '');
  const auditAction = scan.blocked
    ? 'content_blocked'
    : scan.matches.length > 0
      ? 'content_flagged'
      : 'hive_action_write';
  writeAuditLog(db, {
    actor: body.agent_id ?? 'unknown',
    action: auditAction,
    target: 'hive_actions',
    detail: scan.matches.length > 0
      ? JSON.stringify(scan.matches.map(m => m.patternName))
      : null,
    severity: scan.blocked ? 'high' : scan.matches.length > 0 ? 'medium' : 'info',
  });
  if (scan.blocked) {
    return Response.json({ error: 'Content blocked by security scanner' }, { status: 403 });
  }

  const result = db
    .prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts, session_id)
       VALUES (@agent_id, @action_type, @summary, @artifacts, @session_id)`
    )
    .run({
      agent_id: body.agent_id,
      action_type: body.action_type,
      summary: scan.cleanContent,
      artifacts: body.artifacts ? JSON.stringify(body.artifacts) : null,
      session_id: body.session_id ?? null,
    });

  return Response.json({ ok: true, id: Number(result.lastInsertRowid) });
}
