/**
 * Phase 141 / ARTGATE-01..03: save-artifact gate + auto-README update.
 *
 * Three capabilities:
 *
 *   ARTGATE-01 — `promptSaveArtifact`: before persisting an artifact into a
 *   space, the caller asks for a confirmation prompt that names the space
 *   the artifact will land in. The prompt is purely informational; the
 *   caller decides whether to surface it to the operator.
 *
 *   ARTGATE-02 — `saveArtifact`: the gated write path. Before writing, it
 *   asserts the target space is writable (not shared/read-only) and that
 *   the space is the currently-loaded workspace. The artifact is recorded
 *   in the document directory (create-or-update by name) and a run-ledger
 *   `artifact.saved` audit row is written.
 *
 *   ARTGATE-03 — auto-README update: when `auto_readme_update` is enabled
 *   for the space, `saveArtifact` also updates the per-space
 *   `last_artifact_*` pointer columns in `space_artifact_settings` and
 *   writes an `artifact.readme_updated` audit row. The toggle itself is
 *   mutated via `setAutoReadmeUpdate`, which writes its own audit row.
 *
 * The module follows the same code style as workspace.ts, write-rules.ts,
 * shared-space.ts, and space-cache.ts: parameterized SQL, best-effort
 * audit rows, and a single source of truth in the SQLite tables.
 */

import type Database from "better-sqlite3";

import { assertWritableSpace } from "@/lib/shared-space";
import { isWriteTargetInWorkspace } from "@/lib/workspace";
import {
  createDocumentDirectoryEntry,
  updateDocumentDirectoryEntry,
  getDocumentDirectory,
  type DocumentDirectoryEntry,
} from "@/lib/write-rules";

export interface SavePromptResult {
  spaceId: string;
  spaceName: string;
  artifactName: string;
  artifactType: string;
  prompt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function auditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Write an append-only audit_entries row. Same INSERT shape as workspace.ts
 * / write-rules.ts / shared-space.ts. Best-effort: a failure here does not
 * unwind the caller's effect because the SQLite row is the source of truth.
 */
function writeAudit(
  db: Database.Database,
  input: {
    actorId: string;
    actorRole: string;
    eventType: string;
    entityType: string;
    entityId: string;
    reason: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  },
): void {
  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      auditId("art"),
      input.actorId,
      input.actorRole,
      input.eventType,
      input.entityType,
      input.entityId,
      input.reason,
      JSON.stringify(input.metadata),
      input.timestamp,
    );
  } catch {
    // Audit is best-effort: the data row is the source of truth.
  }
}

/**
 * ARTGATE-01: build a save-prompt for an artifact targeted at a space.
 *
 * Looks up the space name and returns a `SavePromptResult` containing a
 * human-readable prompt (`Save to ${spaceName}?`). Throws if the space
 * does not exist. This function does NOT perform a write; it only resolves
 * the prompt the caller should surface before calling `saveArtifact`.
 */
export function promptSaveArtifact(
  db: Database.Database,
  input: { spaceId: string; artifactName: string; artifactType: string },
): SavePromptResult {
  const spaceId = (input.spaceId || "").trim();
  const artifactName = (input.artifactName || "").trim();
  const artifactType = (input.artifactType || "").trim();
  if (!spaceId) throw new Error("promptSaveArtifact: spaceId is required");
  if (!artifactName) throw new Error("promptSaveArtifact: artifactName is required");
  if (!artifactType) throw new Error("promptSaveArtifact: artifactType is required");

  const row = db
    .prepare("SELECT id, name FROM spaces WHERE id = ?")
    .get(spaceId) as { id: string; name: string } | undefined;
  if (!row) {
    throw new Error(`promptSaveArtifact: space '${spaceId}' not found`);
  }

  return {
    spaceId: row.id,
    spaceName: row.name,
    artifactName,
    artifactType,
    prompt: `Save to ${row.name}?`,
  };
}

/**
 * ARTGATE-03: query whether auto-README update is enabled for a space.
 *
 * Returns true when no row exists (the column default is 1) or when
 * `auto_readme_update` is 1. Returns false when the row exists and the
 * flag is 0. Returns true for an unknown space id (no row to disable).
 */
export function isAutoReadmeUpdateEnabled(
  db: Database.Database,
  spaceId: string,
): boolean {
  const sid = (spaceId || "").trim();
  if (!sid) return true;
  const row = db
    .prepare(
      "SELECT auto_readme_update FROM space_artifact_settings WHERE space_id = ?",
    )
    .get(sid) as { auto_readme_update: number } | undefined;
  if (!row) return true;
  return row.auto_readme_update === 1;
}

/**
 * ARTGATE-03: toggle the auto-README-update setting for a space.
 *
 * Upserts `space_artifact_settings` (creating the row with the requested
 * flag if none exists) and writes an `artifact.auto_readme_toggled` audit
 * row. Does not require the space to be writable (the toggle is a settings
 * mutation, not a content write), but does validate the space exists.
 */
export function setAutoReadmeUpdate(
  db: Database.Database,
  input: { spaceId: string; enabled: boolean; actorId: string },
): void {
  const spaceId = (input.spaceId || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!spaceId) throw new Error("setAutoReadmeUpdate: spaceId is required");
  if (!actorId) throw new Error("setAutoReadmeUpdate: actorId is required");

  const existing = db
    .prepare("SELECT 1 AS one FROM spaces WHERE id = ?")
    .get(spaceId) as { one: number } | undefined;
  if (!existing) {
    throw new Error(`setAutoReadmeUpdate: space '${spaceId}' not found`);
  }

  const now = nowIso();
  const flag = input.enabled ? 1 : 0;

  const settingsRow = db
    .prepare(
      "SELECT space_id FROM space_artifact_settings WHERE space_id = ?",
    )
    .get(spaceId) as { space_id: string } | undefined;

  if (settingsRow) {
    db.prepare(
      `UPDATE space_artifact_settings
          SET auto_readme_update = ?, updated_by = ?, updated_at = ?
        WHERE space_id = ?`,
    ).run(flag, actorId, now, spaceId);
  } else {
    db.prepare(
      `INSERT INTO space_artifact_settings
         (space_id, auto_readme_update, updated_by, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(spaceId, flag, actorId, now);
  }

  writeAudit(db, {
    actorId,
    actorRole: "operator",
    eventType: "artifact.auto_readme_toggled",
    entityType: "artifact",
    entityId: `artifact:settings:${spaceId}`,
    reason: input.enabled
      ? `enabled auto-README update for space '${spaceId}'`
      : `disabled auto-README update for space '${spaceId}'`,
    metadata: {
      spaceId,
      enabled: input.enabled,
      actionType: "artifact.auto_readme_toggled",
    },
    timestamp: now,
  });
}

/**
 * ARTGATE-02 + ARTGATE-03: gated save of an artifact into a space.
 *
 * Steps:
 *   1. assertWritableSpace — throws if the space is shared/read-only or missing.
 *   2. isWriteTargetInWorkspace — throws if the space is not the active workspace.
 *   3. document_directory create-or-update by (spaceId, name). If an entry
 *      with the same name exists, update its resource_id (optimistic lock);
 *      otherwise create a new entry.
 *   4. Write an `artifact.saved` audit row.
 *   5. If `isAutoReadmeUpdateEnabled` is true, upsert the
 *      `last_artifact_*` pointer columns in `space_artifact_settings` and
 *      write an `artifact.readme_updated` audit row; set readmeUpdated=true.
 *      Otherwise set readmeUpdated=false.
 *
 * Returns the resulting document directory entry and the readmeUpdated flag.
 */
export function saveArtifact(
  db: Database.Database,
  input: {
    spaceId: string;
    artifactName: string;
    artifactType: string;
    resourceId: string;
    beliefStage: string;
    actorId: string;
    purpose?: string;
  },
): { documentDirectoryEntry: DocumentDirectoryEntry; readmeUpdated: boolean } {
  const spaceId = (input.spaceId || "").trim();
  const artifactName = (input.artifactName || "").trim();
  const artifactType = (input.artifactType || "").trim();
  const resourceId = (input.resourceId || "").trim();
  const beliefStage = (input.beliefStage || "").trim();
  const actorId = (input.actorId || "").trim();
  const purpose = input.purpose;
  if (!spaceId) throw new Error("saveArtifact: spaceId is required");
  if (!artifactName) throw new Error("saveArtifact: artifactName is required");
  if (!artifactType) throw new Error("saveArtifact: artifactType is required");
  if (!resourceId) throw new Error("saveArtifact: resourceId is required");
  if (!beliefStage) throw new Error("saveArtifact: beliefStage is required");
  if (!actorId) throw new Error("saveArtifact: actorId is required");

  // ARTGATE-02: writable-space gate.
  assertWritableSpace(db, spaceId);

  // ARTGATE-02: workspace-load gate.
  if (!isWriteTargetInWorkspace(db, spaceId)) {
    throw new Error(
      "saveArtifact: space is not the active workspace — load the workspace first",
    );
  }

  const now = nowIso();

  // ARTGATE-02: document directory create-or-update by name.
  const existing = getDocumentDirectory(db, spaceId).find(
    (entry) => entry.name === artifactName,
  );

  let documentDirectoryEntry: DocumentDirectoryEntry;
  if (existing) {
    documentDirectoryEntry = updateDocumentDirectoryEntry(db, existing.id, {
      name: artifactName,
      purpose,
      resourceId,
      actorId,
      expectedVersion: existing.version,
    });
  } else {
    documentDirectoryEntry = createDocumentDirectoryEntry(db, {
      spaceId,
      name: artifactName,
      purpose,
      resourceId,
      actorId,
    });
  }

  // ARTGATE-02: run-ledger receipt for the save.
  writeAudit(db, {
    actorId,
    actorRole: "operator",
    eventType: "artifact.saved",
    entityType: "artifact",
    entityId: `artifact:${resourceId}`,
    reason: `saved artifact '${artifactName}' (${artifactType}) into space '${spaceId}'`,
    metadata: {
      spaceId,
      resourceId,
      beliefStage,
      artifactName,
      artifactType,
      actionType: "artifact.saved",
    },
    timestamp: now,
  });

  // ARTGATE-03: auto-README pointer update.
  let readmeUpdated = false;
  if (isAutoReadmeUpdateEnabled(db, spaceId)) {
    const settingsRow = db
      .prepare(
        "SELECT space_id FROM space_artifact_settings WHERE space_id = ?",
      )
      .get(spaceId) as { space_id: string } | undefined;

    if (settingsRow) {
      db.prepare(
        `UPDATE space_artifact_settings
            SET last_artifact_resource_id = ?,
                last_artifact_name = ?,
                last_artifact_saved_at = ?,
                updated_by = ?,
                updated_at = ?
          WHERE space_id = ?`,
      ).run(resourceId, artifactName, now, actorId, now, spaceId);
    } else {
      db.prepare(
        `INSERT INTO space_artifact_settings
           (space_id, auto_readme_update, last_artifact_resource_id, last_artifact_name, last_artifact_saved_at, updated_by, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?)`,
      ).run(spaceId, resourceId, artifactName, now, actorId, now);
    }

    writeAudit(db, {
      actorId,
      actorRole: "operator",
      eventType: "artifact.readme_updated",
      entityType: "artifact",
      entityId: `artifact:readme:${spaceId}`,
      reason: `auto-updated README pointer for space '${spaceId}' after saving '${artifactName}'`,
      metadata: {
        spaceId,
        resourceId,
        artifactName,
        artifactType,
        actionType: "artifact.readme_updated",
      },
      timestamp: now,
    });

    readmeUpdated = true;
  }

  return { documentDirectoryEntry, readmeUpdated };
}

/**
 * ARTGATE-03: return the last-saved artifact pointer for a space.
 *
 * Reads the `last_artifact_*` columns from `space_artifact_settings`.
 * Returns null if no row exists, or if all pointer fields are null (no
 * artifact has been saved since the settings row was created).
 */
export function getLastArtifactPointer(
  db: Database.Database,
  spaceId: string,
): {
  resourceId: string | null;
  name: string | null;
  savedAt: string | null;
} | null {
  const sid = (spaceId || "").trim();
  if (!sid) return null;
  const row = db
    .prepare(
      `SELECT last_artifact_resource_id, last_artifact_name, last_artifact_saved_at
         FROM space_artifact_settings
        WHERE space_id = ?`,
    )
    .get(sid) as
    | {
        last_artifact_resource_id: string | null;
        last_artifact_name: string | null;
        last_artifact_saved_at: string | null;
      }
    | undefined;
  if (!row) return null;
  if (
    row.last_artifact_resource_id === null &&
    row.last_artifact_name === null &&
    row.last_artifact_saved_at === null
  ) {
    return null;
  }
  return {
    resourceId: row.last_artifact_resource_id,
    name: row.last_artifact_name,
    savedAt: row.last_artifact_saved_at,
  };
}
