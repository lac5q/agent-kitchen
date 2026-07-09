import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { writeAuditEntry } from '@/lib/audit/write';
import { AUDIT_EVENT_TYPES, ENTITY_TYPES, ACTOR_ROLES } from '@/lib/audit/event-types';
import type { PaperclipActivityEvent } from '@/types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/paperclip/activity
// ---------------------------------------------------------------------------

/**
 * Phase 146 (FLEET-18): Ingest a Paperclip activity event into MemroOS for
 * NOC / audit / operations visibility.
 *
 * Ownership boundary (FLEET-17): Paperclip owns the activity log, companies,
 * issues, budgets, board, and approvals. MemroOS owns the cross-runtime
 * registry, memory, fleet governance, and audit chain. This endpoint mirrors
 * a thin, redacted copy of a Paperclip activity event into the MemroOS audit
 * chain so the operator can see Paperclip-sourced fleet activity without
 * leaving the MemroOS console.
 *
 * Secrets, adapter configs, auth headers, and env vars are NEVER accepted or
 * stored — the Paperclip audit confirmed these are redacted at source, and
 * this endpoint enforces the same invariant on the MemroOS side.
 *
 * No live Paperclip server is required: the endpoint accepts a well-formed
 * activity event body and writes it to the audit chain. When Paperclip is
 * unconfigured (no PAPERCLIP_BASE_URL), the endpoint still accepts events
 * from an operator or adapter that already fetched them — activity ingestion
 * is a local write, not an upstream proxy call.
 */

// Fields that must never appear in the stored metadata (defense-in-depth).
const REDACTED_KEYS = new Set([
  'adapter_config',
  'adapterConfig',
  'auth',
  'authHeader',
  'auth_header',
  'authorization',
  'apiKey',
  'api_key',
  'token',
  'secret',
  'password',
  'env',
  'envVars',
  'env_vars',
]);

function redactMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export async function POST(req: NextRequest | Request) {
  let body: Record<string, unknown>;
  try {
    body = await (req as Request).json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // --- Validation ---
  const companyId = body.companyId;
  const actorType = body.actorType;
  const actorId = body.actorId;
  const action = body.action;
  const entityType = body.entityType;
  const entityId = body.entityId;
  const timestamp = body.timestamp;

  if (typeof companyId !== 'string' || companyId.trim() === '') {
    return Response.json(
      { error: 'companyId is required and must be a non-empty string' },
      { status: 400 }
    );
  }
  if (
    typeof actorType !== 'string' ||
    !['agent', 'user', 'system'].includes(actorType)
  ) {
    return Response.json(
      { error: 'actorType must be one of: agent, user, system' },
      { status: 400 }
    );
  }
  if (typeof actorId !== 'string' || actorId.trim() === '') {
    return Response.json(
      { error: 'actorId is required and must be a non-empty string' },
      { status: 400 }
    );
  }
  if (typeof action !== 'string' || action.trim() === '') {
    return Response.json(
      { error: 'action is required and must be a non-empty string' },
      { status: 400 }
    );
  }
  if (typeof entityType !== 'string' || entityType.trim() === '') {
    return Response.json(
      { error: 'entityType is required and must be a non-empty string' },
      { status: 400 }
    );
  }
  if (typeof entityId !== 'string' || entityId.trim() === '') {
    return Response.json(
      { error: 'entityId is required and must be a non-empty string' },
      { status: 400 }
    );
  }
  if (typeof timestamp !== 'string' || timestamp.trim() === '') {
    return Response.json(
      { error: 'timestamp is required and must be a non-empty ISO 8601 string' },
      { status: 400 }
    );
  }

  const summary =
    typeof body.summary === 'string' ? body.summary : `${action} on ${entityType}:${entityId}`;

  // Redact any extra metadata fields that might carry secrets.
  const extraMeta: Record<string, unknown> = {};
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    Object.assign(extraMeta, redactMetadata(body.metadata as Record<string, unknown>));
  }

  const event: PaperclipActivityEvent = {
    companyId,
    actorType: actorType as PaperclipActivityEvent['actorType'],
    actorId,
    action,
    entityType,
    entityId,
    summary,
    timestamp,
  };

  // --- Write to audit chain ---
  // The audit chain is append-only (SQLite triggers enforce no UPDATE/DELETE).
  // The event lands in audit_entries with event_type=paperclip.activity and
  // entity_type=paperclip, so NOC / audit query surfaces can filter on it.
  const db = getDb();
  const auditId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const metadata = {
    ...extraMeta,
    companyId: event.companyId,
    actorType: event.actorType,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.summary,
    paperclipTimestamp: event.timestamp,
    source: 'paperclip',
    hardStopOwner: 'paperclip',
  };

  writeAuditEntry(
    {
      id: auditId,
      actor_id: `paperclip:${event.actorId}`,
      actor_role: ACTOR_ROLES.SYSTEM,
      event_type: AUDIT_EVENT_TYPES.PAPERCLIP_ACTIVITY,
      entity_type: ENTITY_TYPES.PAPERCLIP,
      entity_id: `${event.companyId}:${event.entityType}:${event.entityId}`,
      reason: event.summary,
      metadata_json: metadata,
      created_at: createdAt,
    },
    db
  );

  return Response.json(
    {
      ok: true,
      auditId,
      ingested: true,
      hardStopOwner: 'paperclip',
    },
    { status: 201 }
  );
}
