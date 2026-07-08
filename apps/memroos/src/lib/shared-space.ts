/**
 * Phase 139 / SHAREDRO-01..03: is_shared read-only toggle on spaces.
 *
 * A space may be marked as "shared read-only" by toggling its `is_shared`
 * flag to 1. While shared, the space blocks all writes via
 * `assertWritableSpace` (SHAREDRO-01) and records a policy receipt for every
 * read via `assertReadableSpace` (SHAREDRO-02). The toggle itself is audited
 * in `audit_entries` with event_type='space.shared_toggle' (SHAREDRO-03).
 *
 * The toggle is a single boolean: ON means read-only, OFF means writable.
 * Turning the toggle OFF requires a reason (audit trail), while turning it
 * ON may optionally carry a reason.
 */

import type Database from "better-sqlite3";

function nowIso(): string {
  return new Date().toISOString();
}

function auditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * SHAREDRO-03: set the is_shared flag on a space.
 *
 * Updates `spaces.is_shared` and `spaces.shared_reason`, then writes an
 * audit_entries row with event_type='space.shared_toggle'. Turning the
 * toggle OFF (isShared=false) requires a non-empty reason; turning it ON
 * (isShared=true) may optionally carry a reason.
 *
 * Throws if the space does not exist or if a required reason is missing.
 */
export function setSpaceShared(
  db: Database.Database,
  input: {
    spaceId: string;
    isShared: boolean;
    actorId: string;
    reason?: string;
  },
): void {
  const spaceId = (input.spaceId || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!spaceId) throw new Error("setSpaceShared: spaceId is required");
  if (!actorId) throw new Error("setSpaceShared: actorId is required");

  const reason = input.reason !== undefined ? input.reason.trim() : "";
  if (!input.isShared && !reason) {
    throw new Error(
      "setSpaceShared: reason is required when toggling is_shared off (SHAREDRO-03)",
    );
  }

  // Validate the space exists before mutating.
  const existing = db
    .prepare("SELECT id FROM spaces WHERE id = ?")
    .get(spaceId) as { id: string } | undefined;
  if (!existing) {
    throw new Error(`setSpaceShared: space '${spaceId}' not found`);
  }

  const now = nowIso();
  const reasonValue = input.isShared ? (reason || null) : reason;

  db.prepare(
    `UPDATE spaces SET is_shared = ?, shared_reason = ? WHERE id = ?`,
  ).run(input.isShared ? 1 : 0, reasonValue, spaceId);

  // Best-effort audit row (same pattern as workspace.ts / write-rules.ts).
  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'space.shared_toggle', 'space', ?, ?, ?, ?)`,
    ).run(
      auditId("sst"),
      actorId,
      `space:${spaceId}`,
      input.isShared
        ? `marked space '${spaceId}' as shared read-only`
        : `restored space '${spaceId}' to writable`,
      JSON.stringify({
        isShared: input.isShared,
        reason: reasonValue,
        actionType: "space.shared_toggle",
      }),
      now,
    );
  } catch {
    // Audit is best-effort: the spaces row is the source of truth.
  }
}

/**
 * Check whether a space is currently shared (read-only). Returns false if
 * the space does not exist or if `is_shared` is 0.
 */
export function isSpaceShared(db: Database.Database, spaceId: string): boolean {
  const sid = (spaceId || "").trim();
  if (!sid) return false;
  const row = db
    .prepare("SELECT is_shared FROM spaces WHERE id = ?")
    .get(sid) as { is_shared: number } | undefined;
  if (!row) return false;
  return row.is_shared === 1;
}

/**
 * SHAREDRO-01: write-persistence gate.
 *
 * Throws if the space is shared (read-only) or if the space does not exist.
 * Callers should invoke this before any write path that targets a space.
 */
export function assertWritableSpace(
  db: Database.Database,
  spaceId: string,
): void {
  const sid = (spaceId || "").trim();
  const exists = db
    .prepare("SELECT 1 AS one FROM spaces WHERE id = ?")
    .get(sid) as { one: number } | undefined;
  if (!exists) {
    throw new Error("assertWritableSpace: space not found");
  }
  if (isSpaceShared(db, sid)) {
    throw new Error("space is shared read-only — writes blocked (SHAREDRO-01)");
  }
}

/**
 * SHAREDRO-02: read-side gate.
 *
 * If the space is shared, writes a policy receipt to `audit_entries` with
 * event_type='space.shared_read'. If the space is not shared (or does not
 * exist), this is a no-op — the normal read path does not need a receipt.
 */
export function assertReadableSpace(
  db: Database.Database,
  input: {
    spaceId: string;
    actorId: string;
  },
): void {
  const spaceId = (input.spaceId || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!spaceId) throw new Error("assertReadableSpace: spaceId is required");
  if (!actorId) throw new Error("assertReadableSpace: actorId is required");

  if (!isSpaceShared(db, spaceId)) {
    // Normal read path — no receipt needed.
    return;
  }

  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'space.shared_read', 'space', ?, ?, ?, ?)`,
    ).run(
      auditId("ssr"),
      actorId,
      `space:${spaceId}`,
      `read on shared read-only space '${spaceId}'`,
      JSON.stringify({
        spaceId,
        actorId,
        isShared: true,
        actionType: "space.shared_read",
      }),
      now,
    );
  } catch {
    // Audit is best-effort: the read still proceeds.
  }
}

/**
 * SHAREDRO-03: return the toggle history for a space, parsed from
 * audit_entries with event_type='space.shared_toggle'. Ordered newest-first
 * (created_at DESC).
 */
export function getSharedToggleHistory(
  db: Database.Database,
  spaceId: string,
): Array<{
  actorId: string;
  isShared: boolean;
  reason: string | null;
  timestamp: string;
}> {
  const sid = (spaceId || "").trim();
  if (!sid) return [];

  const rows = db
    .prepare(
      `SELECT actor_id, metadata_json, created_at
         FROM audit_entries
        WHERE event_type = 'space.shared_toggle'
          AND entity_id = ?
        ORDER BY created_at DESC`,
    )
    .all(`space:${sid}`) as Array<{
      actor_id: string;
      metadata_json: string;
      created_at: string;
    }>;

  const out: Array<{
    actorId: string;
    isShared: boolean;
    reason: string | null;
    timestamp: string;
  }> = [];
  for (const row of rows) {
    let isShared = false;
    let reason: string | null = null;
    try {
      const meta = JSON.parse(row.metadata_json);
      if (typeof meta.isShared === "boolean") isShared = meta.isShared;
      if (typeof meta.reason === "string") reason = meta.reason;
      else if (meta.reason === null) reason = null;
    } catch {
      // Corrupt metadata — skip parsing, keep defaults.
    }
    out.push({
      actorId: row.actor_id,
      isShared,
      reason,
      timestamp: row.created_at,
    });
  }
  return out;
}
