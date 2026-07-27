/**
 * Persistence for connector-sourced records.
 *
 * Connector content lands in `messages` rather than a table of its own. That
 * is the whole design decision: `runEmbeddingCycle` selects from `messages`,
 * and `messages_fts` is an external-content index over `messages`, so a row
 * written here is embedded and full-text searchable with no changes to either.
 * A separate table would have required forking both.
 *
 * Two constraints this module exists to enforce, because getting either wrong
 * fails silently:
 *
 * 1. LABELS COME FROM THE SPACE. `addSecurityLabelColumns` defaults every row
 *    to `visibility='private', policy='sealed'`, and the messages_fts triggers
 *    only fire on `policy='indexable'` with a non-private visibility. A row
 *    inserted with defaults embeds but never appears in search — indexed
 *    "successfully" and unfindable. We read the labels from
 *    `spaces.default_labels_json` so the security boundary is data an operator
 *    can change, not a literal in the sync loop.
 *
 * 2. `space_id` IS ALWAYS SET. `filterBySpace` falls back to matching
 *    `project` against the space NAME when `space_id` is null or mismatched.
 *    A connector row with a null space_id could therefore surface in an
 *    unrelated space whose name collides with its project string. Every row
 *    written here carries a real space_id, and `connectorProject()` namespaces
 *    the project under `connector/` so the fallback cannot match by accident.
 */

import type Database from "better-sqlite3";

import { detectInjection } from "@/lib/msiq/injection-detector";
import {
  createSpace,
  getSpaceDefaultLabels,
  resolveSpaceId,
  addSpaceMember,
} from "@/lib/space";

import {
  connectorProject,
  connectorSessionId,
  connectorSpaceName,
  type SyncTool,
} from "./manifest";

/** Labels applied to a connector space when it is first created. */
const DEFAULT_CONNECTOR_LABELS = {
  // `indexable` + a non-private visibility is what the messages_fts triggers
  // require. `internal` keeps the content inside the tenant: it is readable by
  // space members and never public. An operator can tighten a space to
  // `sealed` afterwards and ingestion will keep working — the rows simply stop
  // being searchable, which is the intended lever.
  policy: "indexable",
  visibility: "internal",
} as const;

export interface ConnectorSpace {
  spaceId: string;
  labels: Record<string, unknown>;
}

/**
 * Get-or-create the dedicated space for a provider, and ensure the synthetic
 * connector agent is a member.
 *
 * `createSpace` throws on a duplicate (tenant_id, name), so this must resolve
 * first — the sync job runs every cycle and would otherwise throw on run two.
 */
export function ensureConnectorSpace(
  db: Database.Database,
  input: { tenantId: string; providerKey: string },
): ConnectorSpace {
  const tenantId = (input.tenantId || "default-tenant").trim() || "default-tenant";
  const name = connectorSpaceName(input.providerKey);

  let spaceId = resolveSpaceId(db, tenantId, name);
  if (!spaceId) {
    spaceId = createSpace(db, {
      tenantId,
      name,
      defaultLabels: { ...DEFAULT_CONNECTOR_LABELS },
    }).id;
  }

  // The synthetic actor that "owns" connector rows. Nobody in memroos authored
  // a Linear issue, so attributing it to the connecting human would conflate
  // "Luis connected this" with "Luis wrote this" and put an entire shared
  // workspace into one person's memory.
  addSpaceMember(db, {
    spaceId,
    memberId: connectorAgentId(input.providerKey),
    memberType: "agent",
    role: "member",
  });

  return { spaceId, labels: getSpaceDefaultLabels(db, spaceId) };
}

export function connectorAgentId(providerKey: string): string {
  return `connector:${providerKey}`;
}

export interface WriteRecordInput {
  db: Database.Database;
  providerKey: string;
  connectionId: string;
  spaceId: string;
  labels: Record<string, unknown>;
  tool: SyncTool;
  record: Record<string, unknown>;
}

export type WriteOutcome =
  | { status: "written"; id: number }
  /** Already stored and unchanged (or an older copy) — nothing to do. */
  | { status: "duplicate" }
  | { status: "empty" }
  | { status: "quarantined"; rules: string[] }
  | { status: "review_required"; rules: string[] };

/**
 * Write one provider record into `messages`.
 *
 * Idempotent via the table's own `UNIQUE(session_id, request_id)`: session_id
 * is stable per connection and request_id is the provider's object id, so
 * re-syncing an unchanged record is a no-op rather than a duplicate row. No
 * separate dedupe table and no content hashing.
 */
export function writeConnectorRecord(input: WriteRecordInput): WriteOutcome {
  const { db, providerKey, connectionId, spaceId, labels, tool, record } = input;

  const providerId = record[tool.idField];
  if (typeof providerId !== "string" || providerId.length === 0) {
    return { status: "empty" };
  }

  const content = tool.contentFields
    .map((f) => record[f])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join("\n\n")
    .trim();
  if (!content) return { status: "empty" };

  // Provider content is untrusted input that an agent will later read as
  // context. An issue description can carry a forged tool directive or a
  // leaked credential; both must be caught before the text becomes memory.
  const scan = detectInjection(content, "quarantined");
  if (scan.disposition.kind === "quarantined") {
    return { status: "quarantined", rules: scan.disposition.rules };
  }
  if (scan.disposition.kind === "review_required") {
    return { status: "review_required", rules: scan.disposition.rules };
  }

  const visibility = typeof labels.visibility === "string" ? labels.visibility : "private";
  const policy = typeof labels.policy === "string" ? labels.policy : "sealed";
  const domain = typeof labels.domain === "string" ? labels.domain : null;
  const sensitivity = typeof labels.sensitivity === "string" ? labels.sensitivity : null;

  // Each provider names its own timestamp field: Linear has updatedAt,
  // Circleback only createdAt, Notion last_edited_time. Hardcoding `updatedAt`
  // collapsed every Circleback and Notion record onto the ingest date, which
  // corrupts recency ranking and time-range recall.
  const tsField = tool.timestampField;
  const timestamp =
    tsField && typeof record[tsField] === "string"
      ? (record[tsField] as string)
      : new Date().toISOString();

  // Upsert, not INSERT OR IGNORE. The unique constraint absorbs unchanged
  // records, but an edited one must overwrite: with OR IGNORE, a rewritten
  // issue body conflicted and was silently discarded, so memory served the
  // first-ever version of every record forever — defeating the incremental
  // fetch entirely. The timestamp guard keeps it idempotent: a re-fetch of an
  // unchanged record changes nothing, and an out-of-order older copy cannot
  // clobber a newer one.
  const result = db
    .prepare(
      `INSERT INTO messages
         (session_id, project, agent_id, role, content, timestamp,
          space_id, request_id, visibility, policy, domain, sensitivity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, request_id) DO UPDATE SET
         content   = excluded.content,
         timestamp = excluded.timestamp
       WHERE excluded.timestamp > messages.timestamp`,
    )
    .run(
      connectorSessionId(providerKey, connectionId),
      connectorProject(providerKey),
      connectorAgentId(providerKey),
      "connector",
      content,
      timestamp,
      spaceId,
      providerId,
      visibility,
      policy,
      domain,
      sensitivity,
    );

  if (result.changes === 0) return { status: "duplicate" };
  return { status: "written", id: Number(result.lastInsertRowid) };
}

// ---------------------------------------------------------------------------
// Sync state (high-water marks)
// ---------------------------------------------------------------------------

export interface SyncState {
  cursorValue: string | null;
  pageCursor: string | null;
}

export function readSyncState(
  db: Database.Database,
  connectionId: string,
  tool: string,
): SyncState {
  const row = db
    .prepare(
      `SELECT cursor_value, page_cursor FROM connector_sync_state
       WHERE connection_id = ? AND tool = ?`,
    )
    .get(connectionId, tool) as
    | { cursor_value: string | null; page_cursor: string | null }
    | undefined;
  return {
    cursorValue: row?.cursor_value ?? null,
    pageCursor: row?.page_cursor ?? null,
  };
}

export function writeSyncState(
  db: Database.Database,
  input: {
    connectionId: string;
    providerKey: string;
    tool: string;
    cursorValue: string | null;
    pageCursor: string | null;
    status: string;
    rowsWritten: number;
  },
): void {
  db.prepare(
    `INSERT INTO connector_sync_state
       (connection_id, provider_key, tool, cursor_value, page_cursor,
        last_run_at, last_status, rows_written)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(connection_id, tool) DO UPDATE SET
       cursor_value = excluded.cursor_value,
       page_cursor  = excluded.page_cursor,
       last_run_at  = excluded.last_run_at,
       last_status  = excluded.last_status,
       rows_written = connector_sync_state.rows_written + excluded.rows_written`,
  ).run(
    input.connectionId,
    input.providerKey,
    input.tool,
    input.cursorValue,
    input.pageCursor,
    new Date().toISOString(),
    input.status,
    input.rowsWritten,
  );
}
