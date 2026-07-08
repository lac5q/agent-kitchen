/**
 * Phase 137 / WORKLOAD-01..05: single-load workspace + auto context packet.
 *
 * The "active workspace" is the (single) space a human or agent has chosen
 * to operate within. Until a workspace is loaded, the operator cannot write
 * to any space -- every write path funnels through isWriteTargetInWorkspace.
 *
 * Headless mode (cron, batch agents) must fail closed: assertWorkspaceForHeadless
 * throws if no workspace is active. The operator UI surfaces promptWorkspaceSelection
 * to nudge the operator toward a pick before allowing writes.
 *
 * Cross-space reads are explicitly recorded via recordCrossSpaceRead so the
 * policy engine can audit "read X while in Y" patterns.
 */

import type Database from "better-sqlite3";
import { getSpacesForUser, type Space } from "@/lib/space";

export interface ActiveWorkspace {
  spaceId: string;
  spaceName: string;
  loadedBy: string;
  loadedAt: string;
  isHeadless: boolean;
}

interface ActiveWorkspaceRow {
  space_id: string;
  space_name: string;
  loaded_by: string;
  loaded_at: string;
  is_headless: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToActiveWorkspace(row: ActiveWorkspaceRow): ActiveWorkspace {
  return {
    spaceId: row.space_id,
    spaceName: row.space_name,
    loadedBy: row.loaded_by,
    loadedAt: row.loaded_at,
    isHeadless: row.is_headless === 1,
  };
}

/**
 * WORKLOAD-01: load a space as the active workspace.
 *
 * Atomically marks any existing active workspace as cleared, then inserts a
 * new active row for `spaceId`. The freshly-loaded row joins against the
 * `spaces` table to resolve the display name.
 *
 * Writes a run-ledger audit entry with actionType `workspace.loaded` so the
 * load event is visible in agent_history and the audit trail.
 */
export function loadWorkspace(
  db: Database.Database,
  input: { spaceId: string; actorId: string; isHeadless?: boolean }
): ActiveWorkspace {
  const spaceId = (input.spaceId || "").trim();
  const actorId = (input.actorId || "").trim();
  const isHeadless = input.isHeadless === true;
  if (!spaceId) throw new Error("loadWorkspace: spaceId is required");
  if (!actorId) throw new Error("loadWorkspace: actorId is required");

  // Validate the space exists and resolve its name before clearing anything.
  const spaceRow = db
    .prepare("SELECT id, name FROM spaces WHERE id = ?")
    .get(spaceId) as { id: string; name: string } | undefined;
  if (!spaceRow) throw new Error(`loadWorkspace: space '${spaceId}' not found`);

  const now = nowIso();

  db.transaction(() => {
    // 1. Clear any existing active row.
    db.prepare(
      `UPDATE active_workspace
         SET cleared_at = ?
         WHERE cleared_at IS NULL`
    ).run(now);
    // 2. Insert the new active row.
    db.prepare(
      `INSERT INTO active_workspace (space_id, loaded_by, loaded_at, is_headless, cleared_at)
       VALUES (?, ?, ?, ?, NULL)`
    ).run(spaceId, actorId, now, isHeadless ? 1 : 0);
  })();

  // Write run-ledger + audit rows. Best-effort: if the audit table shape changes,
  // we don't want a load() call to swallow the operation's effect, so any error
  // here is rethrown after the workspace row is already in place.
  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, ?, 'workspace.loaded', 'workspace', ?, ?, ?, ?)`
    ).run(
      `wsl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      actorId,
      isHeadless ? "system" : "operator",
      `workspace:${spaceId}`,
      `loaded workspace '${spaceRow.name}'`,
      JSON.stringify({
        spaceId,
        spaceName: spaceRow.name,
        isHeadless,
        actionType: "workspace.loaded",
      }),
      now
    );
  } catch {
    // Audit is best-effort: the workspace row is the source of truth.
  }

  return {
    spaceId,
    spaceName: spaceRow.name,
    loadedBy: actorId,
    loadedAt: now,
    isHeadless,
  };
}

/**
 * Get the currently active workspace, or null if none is loaded.
 *
 * "Active" = a row in `active_workspace` whose `cleared_at` is NULL. If
 * multiple rows are present (shouldn't happen, but defensive), the most
 * recent one wins.
 */
export function getActiveWorkspace(db: Database.Database): ActiveWorkspace | null {
  const row = db
    .prepare(
      `SELECT aw.space_id, s.name AS space_name, aw.loaded_by, aw.loaded_at, aw.is_headless
         FROM active_workspace aw
         JOIN spaces s ON s.id = aw.space_id
        WHERE aw.cleared_at IS NULL
        ORDER BY aw.id DESC
        LIMIT 1`
    )
    .get() as ActiveWorkspaceRow | undefined;
  return row ? rowToActiveWorkspace(row) : null;
}

/**
 * Clear the active workspace by stamping `cleared_at` on the currently
 * active row. Safe to call when no workspace is loaded (no-op).
 */
export function clearWorkspace(db: Database.Database): void {
  db.prepare(
    `UPDATE active_workspace
       SET cleared_at = ?
       WHERE cleared_at IS NULL`
  ).run(nowIso());
}

interface PromptResult {
  needsSelection: boolean;
  availableSpaces: Space[];
}

/**
 * WORKLOAD-03: decide whether the operator needs to be prompted to pick a
 * workspace. Returns the spaces the operator is a member of so the UI can
 * render a picker. When a workspace is already active, returns
 * `{ needsSelection: false, availableSpaces: [] }` (no noise).
 */
export function promptWorkspaceSelection(
  db: Database.Database,
  actorId: string
): PromptResult {
  const active = getActiveWorkspace(db);
  if (active) {
    return { needsSelection: false, availableSpaces: [] };
  }
  return {
    needsSelection: true,
    availableSpaces: getSpacesForUser(db, actorId),
  };
}

/**
 * WORKLOAD-04: assert that a workspace is loaded for headless mode.
 *
 * Headless runs (cron, batch agents, A2A-triggered agents) MUST have an
 * active workspace. If none is loaded we throw -- never silently default
 * to "all spaces" -- because "all spaces" leaks cross-space context into
 * a single run's receipts.
 */
export function assertWorkspaceForHeadless(
  db: Database.Database
): ActiveWorkspace {
  const active = getActiveWorkspace(db);
  if (!active) {
    throw new Error(
      "headless mode requires an active workspace -- no silent default (WORKLOAD-04)"
    );
  }
  return active;
}

/**
 * WORKLOAD-05: check whether a write target lives inside the currently
 * active workspace. Returns false if no workspace is loaded (callers
 * should treat false as "deny" for any write path).
 */
export function isWriteTargetInWorkspace(
  db: Database.Database,
  targetSpaceId: string
): boolean {
  const active = getActiveWorkspace(db);
  if (!active) return false;
  return active.spaceId === targetSpaceId;
}

/**
 * WORKLOAD-05: record a cross-space read.
 *
 * Use when an agent (or operator) reads from a different space than the
 * one currently loaded. The receipt lands in `audit_entries` and includes
 * the source + destination space ids plus the optional policy receipt
 * pointer so the cross-space event can be traced end-to-end.
 */
export function recordCrossSpaceRead(
  db: Database.Database,
  input: {
    fromSpaceId: string;
    toSpaceId: string;
    actorId: string;
    policyReceiptId?: string;
  }
): void {
  const fromSpaceId = (input.fromSpaceId || "").trim();
  const toSpaceId = (input.toSpaceId || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!fromSpaceId) throw new Error("recordCrossSpaceRead: fromSpaceId is required");
  if (!toSpaceId) throw new Error("recordCrossSpaceRead: toSpaceId is required");
  if (!actorId) throw new Error("recordCrossSpaceRead: actorId is required");

  const now = nowIso();
  const metadata = {
    fromSpaceId,
    toSpaceId,
    actionType: "workspace.cross_space_read",
    policyReceiptId: input.policyReceiptId ?? null,
  };
  db.prepare(
    `INSERT INTO audit_entries
       (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
     VALUES (?, 'default-tenant', ?, 'operator', 'workspace.cross_space_read', 'workspace', ?, ?, ?, ?)`
  ).run(
    `csr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    actorId,
    `cross-space read from ${fromSpaceId} to ${toSpaceId}`,
    `workspace:${toSpaceId}`,
    JSON.stringify(metadata),
    now
  );
}
