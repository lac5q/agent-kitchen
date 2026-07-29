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

  syncConnectorSpaceReaders(db, { spaceId, tenantId });

  return { spaceId, labels: getSpaceDefaultLabels(db, spaceId) };
}

/**
 * Enrol the tenant's users and registered agents as readers of a connector
 * space.
 *
 * Until the space gate landed (`authorizeMemoryUse`), `space_id` on connector
 * rows was inert — nothing consulted it, so the only member being the
 * synthetic writer agent cost nothing. With the gate live, that membership
 * set means *nobody* can recall connector content: verified against
 * cordant-hermes-01, where all 401 rows sat in four spaces whose only members
 * were `connector:<provider>`.
 *
 * Enrolling readers here (rather than one-shot backfill) makes it
 * self-healing: `ensureConnectorSpace` runs every sync cycle, so a user or
 * agent registered after the space was created still gets access instead of
 * silently seeing nothing.
 *
 * Idempotent — `addSpaceMember` upserts on (space_id, member_id).
 */
export function syncConnectorSpaceReaders(
  db: Database.Database,
  input: { spaceId: string; tenantId: string },
): { humans: number; agents: number } {
  let humans = 0;
  let agents = 0;

  try {
    const users = db
      .prepare(`SELECT id FROM users WHERE tenant_id = ?`)
      .all(input.tenantId) as Array<{ id: string }>;
    for (const user of users) {
      addSpaceMember(db, {
        spaceId: input.spaceId,
        memberId: user.id,
        memberType: "human",
        role: "member",
      });
      humans += 1;
    }
  } catch {
    // users table absent (fresh/partial DB) — nothing to enrol yet. The next
    // sync cycle re-runs this, so a later-seeded admin still gets access.
  }

  try {
    // registered_agents, not agent_api_keys: an agent that exists but has not
    // minted a key yet still needs to recall, and agent_api_keys rows are
    // per-key rather than per-agent.
    const registered = db
      .prepare(`SELECT id FROM registered_agents`)
      .all() as Array<{ id: string }>;
    for (const agent of registered) {
      addSpaceMember(db, {
        spaceId: input.spaceId,
        memberId: agent.id,
        memberType: "agent",
        role: "member",
      });
      agents += 1;
    }
  } catch {
    // registered_agents absent — same reasoning as above.
  }

  return { humans, agents };
}

export function connectorAgentId(providerKey: string): string {
  return `connector:${providerKey}`;
}

/**
 * Re-enrol readers into every existing connector space.
 *
 * `ensureConnectorSpace` covers spaces as they are synced, but a sync cycle
 * may be hours away — and between the space gate going live and the next
 * cycle, connector recall would return nothing. Running this at startup
 * closes that window: by the time the app can serve a recall, the spaces it
 * already has are enrolled.
 *
 * Safe on a DB with no connector spaces (returns 0) and idempotent.
 */
export function backfillConnectorSpaceReaders(db: Database.Database): number {
  let spaces: Array<{ id: string; tenant_id: string }>;
  try {
    spaces = db
      .prepare(`SELECT id, tenant_id FROM spaces WHERE name LIKE 'connector/%'`)
      .all() as Array<{ id: string; tenant_id: string }>;
  } catch {
    return 0; // spaces table absent — nothing to backfill.
  }
  for (const space of spaces) {
    syncConnectorSpaceReaders(db, { spaceId: space.id, tenantId: space.tenant_id });
  }
  return spaces.length;
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
  // fetch entirely.
  //
  // Two distinct cases the guard must separate:
  //
  //   newer timestamp                  -> provider edit, take it.
  //   SAME timestamp, changed content  -> our stored shape improved, take it.
  //   older timestamp                  -> out-of-order copy, never take it.
  //
  // The middle case is not hypothetical: Notion's timestamp is
  // last_edited_time, so when enrichment starts producing a body for a page
  // previously stored as a bare URL, the timestamps are EQUAL. With a
  // `>`-only guard those rows are pinned at their original content forever —
  // the records that motivated enrichment are precisely the ones it could
  // not fix. The same trap applies to any record first written in a degraded
  // form because its enrichment fetch was throttled.
  //
  // The content clause is deliberately scoped to equal timestamps rather
  // than applied unconditionally: an unqualified `OR content <>` would let a
  // genuinely older out-of-order copy overwrite a newer stored record.
  //
  // Idempotent throughout: an unchanged re-fetch satisfies neither clause.
  const result = db
    .prepare(
      `INSERT INTO messages
         (session_id, project, agent_id, role, content, timestamp,
          space_id, request_id, visibility, policy, domain, sensitivity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, request_id) DO UPDATE SET
         content   = excluded.content,
         timestamp = excluded.timestamp
       WHERE excluded.timestamp > messages.timestamp
          OR (excluded.timestamp = messages.timestamp
              AND excluded.content <> messages.content)`,
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
