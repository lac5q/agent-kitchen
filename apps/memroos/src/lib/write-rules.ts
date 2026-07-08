/**
 * Phase 138 / WRITERULES-01..06: operator-visible write rules + document directory.
 *
 * Write rules are per-space routing declarations that map a `data_type` to a
 * `target_document`. When an agent attempts to write memory, `resolveWriteTarget`
 * consults the rules to decide where the write should land and whether it is
 * allowed at all. The `fallback_rule` column controls behavior when no rule
 * matches the requested data_type: 'reject' blocks the write, 'default_doc'
 * routes it to the fallback rule's target_document.
 *
 * The document directory is a per-space catalog of named documents with
 * optional resource_id pointers and human-readable purposes. Entries are the
 * targets referenced by `write_rules.target_document`.
 *
 * Both write rules and document directory entries use optimistic locking via
 * a `version` column that is incremented on every update. All mutations write
 * to `audit_entries` for the run ledger so operators can trace every change.
 */

import type Database from "better-sqlite3";

export interface WriteRule {
  id: number;
  spaceId: string;
  dataType: string;
  targetDocument: string;
  fallbackRule: "reject" | "default_doc";
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DocumentDirectoryEntry {
  id: number;
  spaceId: string;
  name: string;
  purpose: string | null;
  resourceId: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface WriteRuleRow {
  id: number;
  space_id: string;
  data_type: string;
  target_document: string;
  fallback_rule: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
}

interface DocumentDirectoryRow {
  id: number;
  space_id: string;
  name: string;
  purpose: string | null;
  resource_id: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function auditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function rowToWriteRule(row: WriteRuleRow): WriteRule {
  return {
    id: row.id,
    spaceId: row.space_id,
    dataType: row.data_type,
    targetDocument: row.target_document,
    fallbackRule: row.fallback_rule as "reject" | "default_doc",
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function rowToDocumentDirectoryEntry(row: DocumentDirectoryRow): DocumentDirectoryEntry {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    purpose: row.purpose,
    resourceId: row.resource_id,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * WRITERULES-06: validate a write rule input before persisting.
 *
 * Rejects empty dataType, empty targetDocument, and fallbackRule values
 * outside ('reject', 'default_doc'). If fallbackRule is not provided it
 * defaults to 'reject'.
 */
export function validateWriteRule(input: {
  dataType: string;
  targetDocument: string;
  fallbackRule?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const dataType = (input.dataType || "").trim();
  const targetDocument = (input.targetDocument || "").trim();
  const fallbackRule = (input.fallbackRule ?? "reject").trim() || "reject";

  if (!dataType) {
    errors.push("dataType is required");
  }
  if (!targetDocument) {
    errors.push("targetDocument is required");
  }
  if (fallbackRule !== "reject" && fallbackRule !== "default_doc") {
    errors.push(
      `fallbackRule must be 'reject' or 'default_doc' (got '${fallbackRule}')`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * WRITERULES-01: create a new write rule for a space.
 *
 * Validates the input first (throws with structured errors if invalid),
 * inserts into write_rules, and writes an audit_entries row with
 * event_type='write_rule.created'. Returns the created rule.
 */
export function createWriteRule(
  db: Database.Database,
  input: {
    spaceId: string;
    dataType: string;
    targetDocument: string;
    fallbackRule?: string;
    actorId: string;
  },
): WriteRule {
  const spaceId = (input.spaceId || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!spaceId) throw new Error("createWriteRule: spaceId is required");
  if (!actorId) throw new Error("createWriteRule: actorId is required");

  const validation = validateWriteRule(input);
  if (!validation.valid) {
    throw new Error(
      `createWriteRule: invalid input: ${validation.errors.join("; ")}`,
    );
  }

  const dataType = input.dataType.trim();
  const targetDocument = input.targetDocument.trim();
  const fallbackRule = (input.fallbackRule ?? "reject").trim() || "reject";
  const now = nowIso();

  let id: number;
  try {
    const result = db
      .prepare(
        `INSERT INTO write_rules (space_id, data_type, target_document, fallback_rule, version, created_by, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(spaceId, dataType, targetDocument, fallbackRule, actorId, now);
    id = Number(result.lastInsertRowid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      throw new Error(
        `createWriteRule: a write rule for data_type '${dataType}' already exists in space '${spaceId}'`,
      );
    }
    throw err;
  }

  // Audit entry (best-effort, same pattern as workspace.ts).
  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'write_rule.created', 'write_rule', ?, ?, ?, ?)`,
    ).run(
      auditId("wr"),
      actorId,
      `write_rule:${id}`,
      `created write rule for data_type '${dataType}' in space '${spaceId}'`,
      JSON.stringify({
        actionType: "write_rule.created",
        spaceId,
        ruleId: id,
        dataType,
        targetDocument,
        fallbackRule,
      }),
      now,
    );
  } catch {
    // Audit is best-effort: the write rule row is the source of truth.
  }

  const row = db
    .prepare(
      `SELECT id, space_id, data_type, target_document, fallback_rule, version, created_by, created_at, updated_at, updated_by
       FROM write_rules WHERE id = ?`,
    )
    .get(id) as WriteRuleRow | undefined;
  if (!row) {
    throw new Error(`createWriteRule: inserted row ${id} not found on read-back`);
  }
  return rowToWriteRule(row);
}

/**
 * Return all write rules for a space, ordered by data_type ASC.
 */
export function getWriteRules(db: Database.Database, spaceId: string): WriteRule[] {
  const sid = (spaceId || "").trim();
  if (!sid) return [];
  const rows = db
    .prepare(
      `SELECT id, space_id, data_type, target_document, fallback_rule, version, created_by, created_at, updated_at, updated_by
       FROM write_rules
       WHERE space_id = ?
       ORDER BY data_type ASC`,
    )
    .all(sid) as WriteRuleRow[];
  return rows.map(rowToWriteRule);
}

/**
 * WRITERULES-05: update a write rule with optimistic locking.
 *
 * Selects the current version; if it does not match expectedVersion, throws
 * a version conflict error. Updates the rule with an incremented version,
 * writes an audit_entries row with event_type='write_rule.updated', and
 * returns the updated rule.
 */
export function updateWriteRule(
  db: Database.Database,
  ruleId: number,
  input: {
    targetDocument?: string;
    fallbackRule?: string;
    actorId: string;
    expectedVersion: number;
  },
): WriteRule {
  const actorId = (input.actorId || "").trim();
  if (!actorId) throw new Error("updateWriteRule: actorId is required");

  const current = db
    .prepare(
      `SELECT id, space_id, data_type, target_document, fallback_rule, version, created_by, created_at, updated_at, updated_by
       FROM write_rules WHERE id = ?`,
    )
    .get(ruleId) as WriteRuleRow | undefined;
  if (!current) {
    throw new Error(`updateWriteRule: write rule ${ruleId} not found`);
  }
  if (current.version !== input.expectedVersion) {
    throw new Error(
      `write rule version conflict: expected ${input.expectedVersion}, found ${current.version}`,
    );
  }

  const targetDocument =
    input.targetDocument !== undefined
      ? input.targetDocument.trim()
      : current.target_document;
  const fallbackRule =
    input.fallbackRule !== undefined
      ? input.fallbackRule.trim()
      : current.fallback_rule;

  if (!targetDocument) {
    throw new Error("updateWriteRule: targetDocument cannot be empty");
  }
  if (fallbackRule !== "reject" && fallbackRule !== "default_doc") {
    throw new Error(
      `updateWriteRule: fallbackRule must be 'reject' or 'default_doc' (got '${fallbackRule}')`,
    );
  }

  const newVersion = current.version + 1;
  const now = nowIso();

  db.prepare(
    `UPDATE write_rules
       SET target_document = ?, fallback_rule = ?, version = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`,
  ).run(targetDocument, fallbackRule, newVersion, now, actorId, ruleId);

  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'write_rule.updated', 'write_rule', ?, ?, ?, ?)`,
    ).run(
      auditId("wr"),
      actorId,
      `write_rule:${ruleId}`,
      `updated write rule ${ruleId} to version ${newVersion}`,
      JSON.stringify({
        actionType: "write_rule.updated",
        spaceId: current.space_id,
        ruleId,
        dataType: current.data_type,
        targetDocument,
        fallbackRule,
        previousVersion: current.version,
        newVersion,
      }),
      now,
    );
  } catch {
    // Audit is best-effort.
  }

  const row = db
    .prepare(
      `SELECT id, space_id, data_type, target_document, fallback_rule, version, created_by, created_at, updated_at, updated_by
       FROM write_rules WHERE id = ?`,
    )
    .get(ruleId) as WriteRuleRow | undefined;
  if (!row) {
    throw new Error(`updateWriteRule: updated row ${ruleId} not found on read-back`);
  }
  return rowToWriteRule(row);
}

/**
 * WRITERULES-05: delete a write rule with optimistic locking.
 *
 * Selects the current version; if it does not match expectedVersion, throws
 * a version conflict error. Deletes the rule and writes an audit_entries
 * row with event_type='write_rule.deleted'.
 */
export function deleteWriteRule(
  db: Database.Database,
  ruleId: number,
  input: { actorId: string; expectedVersion: number },
): void {
  const actorId = (input.actorId || "").trim();
  if (!actorId) throw new Error("deleteWriteRule: actorId is required");

  const current = db
    .prepare(
      `SELECT id, space_id, data_type, version FROM write_rules WHERE id = ?`,
    )
    .get(ruleId) as
    | { id: number; space_id: string; data_type: string; version: number }
    | undefined;
  if (!current) {
    throw new Error(`deleteWriteRule: write rule ${ruleId} not found`);
  }
  if (current.version !== input.expectedVersion) {
    throw new Error(
      `write rule version conflict: expected ${input.expectedVersion}, found ${current.version}`,
    );
  }

  const now = nowIso();
  db.prepare(`DELETE FROM write_rules WHERE id = ?`).run(ruleId);

  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'write_rule.deleted', 'write_rule', ?, ?, ?, ?)`,
    ).run(
      auditId("wr"),
      actorId,
      `write_rule:${ruleId}`,
      `deleted write rule ${ruleId} (data_type '${current.data_type}') from space '${current.space_id}'`,
      JSON.stringify({
        actionType: "write_rule.deleted",
        spaceId: current.space_id,
        ruleId,
        dataType: current.data_type,
        deletedVersion: current.version,
      }),
      now,
    );
  } catch {
    // Audit is best-effort.
  }
}

/**
 * WRITERULES-02: resolve where a write should land for a given data_type.
 *
 * Looks up write_rules for (spaceId, dataType). If an exact match is found,
 * returns { matched: true, targetDocument, receiptReason: "matched" }.
 * If no exact match, checks if any rule in the space has
 * fallback_rule='default_doc' -- if so, returns that rule's targetDocument
 * with receiptReason "fallback". Otherwise returns { matched: false, ... }
 * and writes an audit_entries row with event_type='write_rule.mismatch'.
 */
export function resolveWriteTarget(
  db: Database.Database,
  spaceId: string,
  dataType: string,
): { matched: boolean; targetDocument: string | null; receiptReason: string } {
  const sid = (spaceId || "").trim();
  const dt = (dataType || "").trim();
  if (!sid || !dt) {
    return {
      matched: false,
      targetDocument: null,
      receiptReason: "no matching write rule and fallback is reject",
    };
  }

  // 1. Exact match on (space_id, data_type).
  const exact = db
    .prepare(
      `SELECT target_document FROM write_rules WHERE space_id = ? AND data_type = ? LIMIT 1`,
    )
    .get(sid, dt) as { target_document: string } | undefined;
  if (exact) {
    return {
      matched: true,
      targetDocument: exact.target_document,
      receiptReason: "matched",
    };
  }

  // 2. Fallback: any rule with fallback_rule='default_doc' in this space.
  const fallback = db
    .prepare(
      `SELECT target_document FROM write_rules WHERE space_id = ? AND fallback_rule = 'default_doc' LIMIT 1`,
    )
    .get(sid) as { target_document: string } | undefined;
  if (fallback) {
    return {
      matched: true,
      targetDocument: fallback.target_document,
      receiptReason: "fallback",
    };
  }

  // 3. No match, no fallback -- reject.
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', 'system', 'system', 'write_rule.mismatch', 'write_rule', ?, ?, ?, ?)`,
    ).run(
      auditId("wrm"),
      `write_rule:${sid}:${dt}`,
      `no matching write rule for data_type '${dt}' in space '${sid}' and fallback is reject`,
      JSON.stringify({
        actionType: "write_rule.mismatch",
        spaceId: sid,
        dataType: dt,
      }),
      now,
    );
  } catch {
    // Audit is best-effort.
  }

  return {
    matched: false,
    targetDocument: null,
    receiptReason: "no matching write rule and fallback is reject",
  };
}

/**
 * WRITERULES-03: create a new document directory entry for a space.
 *
 * Inserts into document_directory and writes an audit_entries row with
 * event_type='document_dir.created'. Returns the created entry.
 */
export function createDocumentDirectoryEntry(
  db: Database.Database,
  input: {
    spaceId: string;
    name: string;
    purpose?: string;
    resourceId?: string;
    actorId: string;
  },
): DocumentDirectoryEntry {
  const spaceId = (input.spaceId || "").trim();
  const name = (input.name || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!spaceId) throw new Error("createDocumentDirectoryEntry: spaceId is required");
  if (!name) throw new Error("createDocumentDirectoryEntry: name is required");
  if (!actorId) throw new Error("createDocumentDirectoryEntry: actorId is required");

  const purpose = input.purpose ?? null;
  const resourceId = input.resourceId ?? null;
  const now = nowIso();

  let id: number;
  try {
    const result = db
      .prepare(
        `INSERT INTO document_directory (space_id, name, purpose, resource_id, version, created_by, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(spaceId, name, purpose, resourceId, actorId, now);
    id = Number(result.lastInsertRowid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      throw new Error(
        `createDocumentDirectoryEntry: a document named '${name}' already exists in space '${spaceId}'`,
      );
    }
    throw err;
  }

  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'document_dir.created', 'document_dir', ?, ?, ?, ?)`,
    ).run(
      auditId("dd"),
      actorId,
      `document_dir:${id}`,
      `created document directory entry '${name}' in space '${spaceId}'`,
      JSON.stringify({
        actionType: "document_dir.created",
        spaceId,
        entryId: id,
        name,
        purpose,
        resourceId,
      }),
      now,
    );
  } catch {
    // Audit is best-effort.
  }

  const row = db
    .prepare(
      `SELECT id, space_id, name, purpose, resource_id, version, created_by, created_at, updated_at, updated_by
       FROM document_directory WHERE id = ?`,
    )
    .get(id) as DocumentDirectoryRow | undefined;
  if (!row) {
    throw new Error(
      `createDocumentDirectoryEntry: inserted row ${id} not found on read-back`,
    );
  }
  return rowToDocumentDirectoryEntry(row);
}

/**
 * Return all document directory entries for a space, ordered by name ASC.
 */
export function getDocumentDirectory(
  db: Database.Database,
  spaceId: string,
): DocumentDirectoryEntry[] {
  const sid = (spaceId || "").trim();
  if (!sid) return [];
  const rows = db
    .prepare(
      `SELECT id, space_id, name, purpose, resource_id, version, created_by, created_at, updated_at, updated_by
       FROM document_directory
       WHERE space_id = ?
       ORDER BY name ASC`,
    )
    .all(sid) as DocumentDirectoryRow[];
  return rows.map(rowToDocumentDirectoryEntry);
}

/**
 * WRITERULES-05: update a document directory entry with optimistic locking.
 *
 * Selects the current version; if it does not match expectedVersion, throws
 * a version conflict error. Updates the entry with an incremented version,
 * writes an audit_entries row with event_type='document_dir.updated', and
 * returns the updated entry.
 */
export function updateDocumentDirectoryEntry(
  db: Database.Database,
  entryId: number,
  input: {
    name?: string;
    purpose?: string;
    resourceId?: string;
    actorId: string;
    expectedVersion: number;
  },
): DocumentDirectoryEntry {
  const actorId = (input.actorId || "").trim();
  if (!actorId) throw new Error("updateDocumentDirectoryEntry: actorId is required");

  const current = db
    .prepare(
      `SELECT id, space_id, name, purpose, resource_id, version, created_by, created_at, updated_at, updated_by
       FROM document_directory WHERE id = ?`,
    )
    .get(entryId) as DocumentDirectoryRow | undefined;
  if (!current) {
    throw new Error(`updateDocumentDirectoryEntry: entry ${entryId} not found`);
  }
  if (current.version !== input.expectedVersion) {
    throw new Error(
      `write rule version conflict: expected ${input.expectedVersion}, found ${current.version}`,
    );
  }

  const name =
    input.name !== undefined ? input.name.trim() : current.name;
  const purpose =
    input.purpose !== undefined ? input.purpose : current.purpose;
  const resourceId =
    input.resourceId !== undefined ? input.resourceId : current.resource_id;

  if (!name) {
    throw new Error("updateDocumentDirectoryEntry: name cannot be empty");
  }

  const newVersion = current.version + 1;
  const now = nowIso();

  try {
    db.prepare(
      `UPDATE document_directory
         SET name = ?, purpose = ?, resource_id = ?, version = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    ).run(name, purpose, resourceId, newVersion, now, actorId, entryId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      throw new Error(
        `updateDocumentDirectoryEntry: a document named '${name}' already exists in space '${current.space_id}'`,
      );
    }
    throw err;
  }

  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'document_dir.updated', 'document_dir', ?, ?, ?, ?)`,
    ).run(
      auditId("dd"),
      actorId,
      `document_dir:${entryId}`,
      `updated document directory entry ${entryId} to version ${newVersion}`,
      JSON.stringify({
        actionType: "document_dir.updated",
        spaceId: current.space_id,
        entryId,
        name,
        purpose,
        resourceId,
        previousVersion: current.version,
        newVersion,
      }),
      now,
    );
  } catch {
    // Audit is best-effort.
  }

  const row = db
    .prepare(
      `SELECT id, space_id, name, purpose, resource_id, version, created_by, created_at, updated_at, updated_by
       FROM document_directory WHERE id = ?`,
    )
    .get(entryId) as DocumentDirectoryRow | undefined;
  if (!row) {
    throw new Error(
      `updateDocumentDirectoryEntry: updated row ${entryId} not found on read-back`,
    );
  }
  return rowToDocumentDirectoryEntry(row);
}

/**
 * WRITERULES-05: delete a document directory entry with optimistic locking.
 *
 * Selects the current version; if it does not match expectedVersion, throws
 * a version conflict error. Deletes the entry and writes an audit_entries
 * row with event_type='document_dir.deleted'.
 */
export function deleteDocumentDirectoryEntry(
  db: Database.Database,
  entryId: number,
  input: { actorId: string; expectedVersion: number },
): void {
  const actorId = (input.actorId || "").trim();
  if (!actorId) throw new Error("deleteDocumentDirectoryEntry: actorId is required");

  const current = db
    .prepare(
      `SELECT id, space_id, name, version FROM document_directory WHERE id = ?`,
    )
    .get(entryId) as
    | { id: number; space_id: string; name: string; version: number }
    | undefined;
  if (!current) {
    throw new Error(`deleteDocumentDirectoryEntry: entry ${entryId} not found`);
  }
  if (current.version !== input.expectedVersion) {
    throw new Error(
      `write rule version conflict: expected ${input.expectedVersion}, found ${current.version}`,
    );
  }

  const now = nowIso();
  db.prepare(`DELETE FROM document_directory WHERE id = ?`).run(entryId);

  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, 'operator', 'document_dir.deleted', 'document_dir', ?, ?, ?, ?)`,
    ).run(
      auditId("dd"),
      actorId,
      `document_dir:${entryId}`,
      `deleted document directory entry '${current.name}' from space '${current.space_id}'`,
      JSON.stringify({
        actionType: "document_dir.deleted",
        spaceId: current.space_id,
        entryId,
        name: current.name,
        deletedVersion: current.version,
      }),
      now,
    );
  } catch {
    // Audit is best-effort.
  }
}

/**
 * WRITERULES-04: check whether an agent's view of write rules is stale.
 *
 * Computes the max version across all write_rules for the space. If
 * agentKnownVersion is less than the current max version, the agent's
 * view is stale and should be refreshed before any write.
 */
export function checkWriteRuleDrift(
  db: Database.Database,
  spaceId: string,
  agentKnownVersion: number,
): { isStale: boolean; currentVersion: number; driftReceiptReason: string } {
  const sid = (spaceId || "").trim();
  if (!sid) {
    return { isStale: false, currentVersion: 0, driftReceiptReason: "current" };
  }

  const row = db
    .prepare(
      `SELECT MAX(version) AS max_version FROM write_rules WHERE space_id = ?`,
    )
    .get(sid) as { max_version: number | null } | undefined;

  const currentVersion = row?.max_version ?? 0;

  if (agentKnownVersion < currentVersion) {
    return {
      isStale: true,
      currentVersion,
      driftReceiptReason: "agent view is stale",
    };
  }
  return {
    isStale: false,
    currentVersion,
    driftReceiptReason: "current",
  };
}
