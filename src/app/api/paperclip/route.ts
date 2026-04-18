import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type {
  PaperclipAutonomyMode,
  PaperclipFleetAgent,
  PaperclipFleetSummary,
  PaperclipOperation,
} from '@/types';

export const dynamic = 'force-dynamic';

const PAPERCLIP_BASE_URL = process.env.PAPERCLIP_BASE_URL || '';
const PAPERCLIP_STATUS_PATH = process.env.PAPERCLIP_STATUS_PATH || '/api/fleet';
const PAPERCLIP_DISPATCH_PATH = process.env.PAPERCLIP_DISPATCH_PATH || '/api/dispatch';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps case-insensitive upstream autonomy strings to the exact PAPER-03
 * vocabulary. Unknown values default to "Interactive" (T-21-01 mitigation).
 */
function normalizeAutonomy(raw: string): PaperclipAutonomyMode {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'interactive') return 'Interactive';
  if (lower === 'autonomous') return 'Autonomous';
  if (lower === 'continuous') return 'Continuous';
  if (lower === 'hybrid') return 'Hybrid';
  return 'Interactive';
}

interface CheckpointData {
  sessionId: string;
  completedSteps: string[];
  resumeFrom: string | null;
  lastStepAt: string;
}

/**
 * Safely parses checkpoint JSON; returns safe defaults on failure.
 */
function parseCheckpoint(json: string | null): CheckpointData {
  if (!json) {
    return { sessionId: '', completedSteps: [], resumeFrom: null, lastStepAt: '' };
  }
  try {
    const parsed = JSON.parse(json);
    return {
      sessionId: parsed.sessionId ?? '',
      completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
      resumeFrom: parsed.resumeFrom ?? null,
      lastStepAt: parsed.lastStepAt ?? '',
    };
  } catch {
    return { sessionId: '', completedSteps: [], resumeFrom: null, lastStepAt: '' };
  }
}

interface DelegationRow {
  task_id: string;
  status: string;
  task_summary: string;
  checkpoint: string | null;
  updated_at: string;
}

/**
 * Reads local hive_delegations rows for Paperclip, sorted newest-first.
 */
function getLocalOperations(db: ReturnType<typeof getDb>): PaperclipOperation[] {
  const rows = db
    .prepare(
      `SELECT task_id, status, task_summary, checkpoint, updated_at
       FROM hive_delegations
       WHERE to_agent = 'paperclip'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
    .all() as DelegationRow[];

  return rows.map((row) => {
    const cp = parseCheckpoint(row.checkpoint);
    return {
      taskId: row.task_id,
      sessionId: cp.sessionId,
      status: row.status as PaperclipOperation['status'],
      summary: row.task_summary,
      resumeFrom: cp.resumeFrom,
      completedSteps: cp.completedSteps,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Derives a PaperclipFleetSummary from normalized agents and local operations.
 */
function buildSummary(
  agents: PaperclipFleetAgent[],
  operations: PaperclipOperation[]
): PaperclipFleetSummary {
  const fleetStatus: PaperclipFleetSummary['fleetStatus'] =
    agents.length === 0
      ? 'offline'
      : agents.some((a) => a.status === 'error')
      ? 'degraded'
      : 'active';

  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const activeTasks = agents.filter((a) => a.activeTask !== null).length;
  const pausedRecoveries = operations.filter((o) => o.status === 'paused').length;

  const autonomyMix: Record<PaperclipAutonomyMode, number> = {
    Interactive: 0,
    Autonomous: 0,
    Continuous: 0,
    Hybrid: 0,
  };
  for (const agent of agents) {
    autonomyMix[agent.autonomyMode] = (autonomyMix[agent.autonomyMode] ?? 0) + 1;
  }

  const heartbeats = agents
    .map((a) => a.lastHeartbeat)
    .filter((h): h is string => h !== null)
    .sort()
    .reverse();
  const lastHeartbeat = heartbeats[0] ?? null;

  return {
    fleetStatus,
    totalAgents: agents.length,
    activeAgents,
    activeTasks,
    pausedRecoveries,
    autonomyMix,
    lastHeartbeat,
  };
}

// ---------------------------------------------------------------------------
// GET /api/paperclip
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest | Request) {
  const db = getDb();
  const timestamp = new Date().toISOString();
  let agents: PaperclipFleetAgent[] = [];

  // Read env at request time so runtime config changes (and test overrides) are respected
  const baseUrl = process.env.PAPERCLIP_BASE_URL || PAPERCLIP_BASE_URL;
  const statusPath = process.env.PAPERCLIP_STATUS_PATH || PAPERCLIP_STATUS_PATH;

  // Try upstream fleet fetch with 5-second timeout (T-21-04 mitigation)
  if (baseUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const upstreamRes = await fetch(
        `${baseUrl}${statusPath}`,
        { signal: controller.signal }
      );
      if (upstreamRes.ok) {
        const payload = await upstreamRes.json();
        const rawAgents: Array<Record<string, unknown>> = Array.isArray(payload.agents)
          ? payload.agents
          : [];
        // T-21-01: normalize all autonomy/status fields before returning to browser
        agents = rawAgents.map((a) => ({
          id: String(a.id ?? ''),
          name: String(a.name ?? ''),
          status: (['active', 'idle', 'dormant', 'error'] as const).includes(
            a.status as 'active' | 'idle' | 'dormant' | 'error'
          )
            ? (a.status as PaperclipFleetAgent['status'])
            : 'idle',
          autonomyMode: normalizeAutonomy(String(a.autonomyMode ?? '')),
          activeTask: a.activeTask != null ? String(a.activeTask) : null,
          lastHeartbeat: a.lastHeartbeat != null ? String(a.lastHeartbeat) : null,
        }));
      }
    } catch {
      // Upstream offline — agents stays empty (T-21-04)
    } finally {
      clearTimeout(timeout);
    }
  }

  const operations = getLocalOperations(db);
  const summary = buildSummary(agents, operations);

  return Response.json({ summary, agents, operations, timestamp });
}

// ---------------------------------------------------------------------------
// POST /api/paperclip
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest | Request) {
  let body: Record<string, unknown>;
  try {
    body = await (req as Request).json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validation (PAPER-02 + T-21-02)
  const taskSummary = body.taskSummary;
  const requestedBy = body.requestedBy;

  if (typeof taskSummary !== 'string' || taskSummary.trim() === '') {
    return Response.json(
      { error: 'taskSummary is required and must be a non-empty string' },
      { status: 400 }
    );
  }
  if (typeof requestedBy !== 'string' || requestedBy.trim() === '') {
    return Response.json(
      { error: 'requestedBy is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  // Read env at request time so tests can manipulate it via beforeEach
  const baseUrl = process.env.PAPERCLIP_BASE_URL || '';
  if (!baseUrl) {
    return Response.json(
      { error: 'Paperclip service not configured' },
      { status: 503 }
    );
  }

  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId
      : crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const priority = typeof body.priority === 'number' ? body.priority : 5;

  const dispatchPath = process.env.PAPERCLIP_DISPATCH_PATH || '/api/dispatch';

  // Forward dispatch upstream with 10-second timeout (T-21-04)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstreamRes = await fetch(`${baseUrl}${dispatchPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskSummary, requestedBy, sessionId, taskId, priority }),
      signal: controller.signal,
    });
    if (!upstreamRes.ok) {
      return Response.json(
        { error: `Upstream dispatch failed: ${upstreamRes.status}` },
        { status: 502 }
      );
    }
  } catch (err) {
    return Response.json(
      { error: `Upstream dispatch unreachable: ${(err as Error).message}` },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  // On success: write local DB records (T-21-03 audit trail, T-21-05 parameterized)
  const db = getDb();
  const checkpoint = JSON.stringify({
    sessionId,
    completedSteps: [],
    resumeFrom: 'dispatch',
    lastStepAt: new Date().toISOString(),
  });

  db.prepare(
    `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint)
     VALUES (@task_id, @from_agent, @to_agent, @task_summary, @priority, @status, @checkpoint)
     ON CONFLICT(task_id) DO UPDATE SET
       status     = excluded.status,
       checkpoint = excluded.checkpoint,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
  ).run({
    task_id: taskId,
    from_agent: requestedBy,
    to_agent: 'paperclip',
    task_summary: taskSummary,
    priority,
    status: 'active',
    checkpoint,
  });

  db.prepare(
    `INSERT INTO hive_actions(agent_id, action_type, summary, session_id)
     VALUES (@agent_id, @action_type, @summary, @session_id)`
  ).run({
    agent_id: 'paperclip',
    action_type: 'trigger',
    summary: taskSummary,
    session_id: sessionId,
  });

  return Response.json({ ok: true, taskId, sessionId });
}
