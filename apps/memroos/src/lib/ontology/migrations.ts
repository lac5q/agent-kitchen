import { createHash, randomUUID } from "crypto";
import type Database from "better-sqlite3";

import { commitAuditAtomic } from "@/lib/skills/skill-audit-atomic";
import { OntologyGovernanceError } from "./candidates";
import { discoverOntology } from "./registry";
import { registerOntologyDerivative } from "./validity";

export interface OntologyMigrationPlan {
  id: string;
  tenantId: string;
  spaceId: string;
  source: { ontologyId: string; version: string; hash: string };
  target: { ontologyId: string; version: string; hash: string };
  mappings: Record<string, string[]>;
  planHash: string;
  status: "planned" | "approved" | "executing" | "incomplete" | "completed" | "rejected";
  snapshot: { id: string; inventoryHash: string; itemCount: number };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function clean(value: string, field: string): string { const result = value?.trim(); if (!result) throw new OntologyGovernanceError(`${field} is required`, "invalid"); return result; }
type MigrationSnapshot = OntologyMigrationPlan["snapshot"];
type SnapshotItem = {
  id: string;
  ordinal: number;
  tenantId: string;
  spaceId: string;
  recordType: string;
  recordId: string;
  sourceType: string;
  sourceOntologyId: string;
  sourceVersion: string;
  sourceHash: string;
  sourceVersionedRecordId: string;
  sourceId: string;
  sourceLifecycleHash: string;
  sourceRecordHash: string;
};
type SourceInventoryRow = {
  id: string;
  tenant_id: string;
  space_id: string;
  record_type: string;
  record_id: string;
  legacy_type: string;
  ontology_id: string;
  ontology_version: string;
  ontology_content_hash: string;
  source_id: string;
  source_hash: string;
};

function snapshotFrom(row: Record<string, string | number>): MigrationSnapshot {
  return { id: String(row.id), inventoryHash: String(row.inventory_hash), itemCount: Number(row.item_count) };
}
function loadSnapshot(db: Database.Database, plan: { id: string; tenantId: string; spaceId: string }): MigrationSnapshot {
  const row = db.prepare(
    `SELECT id, inventory_hash, item_count FROM ontology_migration_snapshots
     WHERE plan_id = ? AND tenant_id = ? AND space_id = ?`
  ).get(plan.id, plan.tenantId, plan.spaceId) as Record<string, string | number> | undefined;
  if (!row) throw new OntologyGovernanceError("migration snapshot is unavailable", "unavailable");
  return snapshotFrom(row);
}
function planFrom(db: Database.Database, row: Record<string, string>): OntologyMigrationPlan {
  const plan = { id: row.id, tenantId: row.tenant_id, spaceId: row.space_id };
  return { ...plan, source: { ontologyId: row.source_ontology_id, version: row.source_version, hash: row.source_hash }, target: { ontologyId: row.target_ontology_id, version: row.target_version, hash: row.target_hash }, mappings: JSON.parse(row.mappings_json) as Record<string, string[]>, planHash: row.plan_hash, status: row.status as OntologyMigrationPlan["status"], snapshot: loadSnapshot(db, plan) };
}
function isSafeVocabulary(value: string): boolean { return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value); }
function targetExists(db: Database.Database, ontology: ReturnType<typeof discoverOntology>, targetType: string): boolean {
  return ontology.definitions.some((definition) => definition.id === targetType)
    || Boolean(db.prepare(`SELECT 1 FROM ontology_canonical_definitions WHERE ontology_id = ? AND ontology_version = ? AND canonical_id = ?`).get(ontology.ontologyId, ontology.version, targetType));
}

function sourceInventory(db: Database.Database, input: { tenantId: string; spaceId: string; source: { ontologyId: string; version: string; hash: string } }): SnapshotItem[] {
  const rows = db.prepare(
    `SELECT vr.id, vr.tenant_id, vr.space_id, vr.record_type, vr.record_id,
            vr.legacy_type, vr.ontology_id, vr.ontology_version, vr.ontology_content_hash,
            vr.source_id, vr.source_hash
       FROM ontology_versioned_records vr
       JOIN ontology_derivative_validity derivative
         ON derivative.derivative_type = 'versioned_record'
        AND derivative.derivative_id = vr.id
        AND derivative.tenant_id = vr.tenant_id
        AND derivative.space_id = vr.space_id
        AND derivative.source_id = vr.source_id
        AND derivative.source_hash = vr.source_hash
        AND derivative.status = 'authoritative'
       JOIN ontology_source_lifecycle source_lifecycle
         ON source_lifecycle.tenant_id = vr.tenant_id
        AND source_lifecycle.space_id = vr.space_id
        AND source_lifecycle.source_id = vr.source_id
        AND source_lifecycle.source_hash = vr.source_hash
        AND source_lifecycle.status = 'active'
      WHERE vr.tenant_id = ? AND vr.space_id = ?
        AND vr.ontology_id = ? AND vr.ontology_version = ? AND vr.ontology_content_hash = ?
        AND vr.source_id IS NOT NULL AND vr.source_hash IS NOT NULL
      ORDER BY vr.record_type ASC, vr.record_id ASC, vr.id ASC`
  ).all(input.tenantId, input.spaceId, input.source.ontologyId, input.source.version, input.source.hash) as SourceInventoryRow[];
  return rows.map((row, ordinal) => ({
    id: `ontmigsnapitem_${randomUUID()}`,
    ordinal,
    tenantId: row.tenant_id,
    spaceId: row.space_id,
    recordType: row.record_type,
    recordId: row.record_id,
    sourceType: row.legacy_type || row.record_type,
    sourceOntologyId: row.ontology_id,
    sourceVersion: row.ontology_version,
    sourceHash: row.ontology_content_hash,
    sourceVersionedRecordId: row.id,
    sourceId: row.source_id,
    sourceLifecycleHash: row.source_hash,
    sourceRecordHash: digest({
      id: row.id,
      tenantId: row.tenant_id,
      spaceId: row.space_id,
      recordType: row.record_type,
      recordId: row.record_id,
      sourceType: row.legacy_type || row.record_type,
      sourceOntologyId: row.ontology_id,
      sourceVersion: row.ontology_version,
      sourceHash: row.ontology_content_hash,
      sourceId: row.source_id,
      sourceLifecycleHash: row.source_hash,
    }),
  }));
}
function inventoryHash(items: SnapshotItem[]): string {
  return digest(items.map((item) => ({
    ordinal: item.ordinal,
    tenantId: item.tenantId,
    spaceId: item.spaceId,
    recordType: item.recordType,
    recordId: item.recordId,
    sourceType: item.sourceType,
    sourceOntologyId: item.sourceOntologyId,
    sourceVersion: item.sourceVersion,
    sourceHash: item.sourceHash,
    sourceVersionedRecordId: item.sourceVersionedRecordId,
    sourceId: item.sourceId,
    sourceLifecycleHash: item.sourceLifecycleHash,
    sourceRecordHash: item.sourceRecordHash,
  })));
}
function loadSnapshotItems(db: Database.Database, plan: OntologyMigrationPlan): SnapshotItem[] {
  const rows = db.prepare(
    `SELECT item.*
       FROM ontology_migration_snapshot_items item
       JOIN ontology_migration_snapshots snapshot ON snapshot.id = item.snapshot_id
      WHERE snapshot.plan_id = ? AND snapshot.tenant_id = ? AND snapshot.space_id = ?
      ORDER BY item.ordinal ASC`
  ).all(plan.id, plan.tenantId, plan.spaceId) as Array<Record<string, string | number>>;
  const items = rows.map((row) => ({
    id: String(row.id),
    ordinal: Number(row.ordinal),
    tenantId: String(row.tenant_id),
    spaceId: String(row.space_id),
    recordType: String(row.record_type),
    recordId: String(row.record_id),
    sourceType: String(row.source_type),
    sourceOntologyId: String(row.source_ontology_id),
    sourceVersion: String(row.source_version),
    sourceHash: String(row.source_hash),
    sourceVersionedRecordId: String(row.source_versioned_record_id),
    sourceId: String(row.source_id),
    sourceLifecycleHash: String(row.source_lifecycle_hash),
    sourceRecordHash: String(row.source_record_hash),
  }));
  if (items.length !== plan.snapshot.itemCount || items.length === 0 || inventoryHash(items) !== plan.snapshot.inventoryHash) {
    throw new OntologyGovernanceError("migration snapshot integrity is unavailable", "unavailable");
  }
  if (items.some((item, index) => item.ordinal !== index
    || item.tenantId !== plan.tenantId
    || item.spaceId !== plan.spaceId
    || item.sourceOntologyId !== plan.source.ontologyId
    || item.sourceVersion !== plan.source.version
    || item.sourceHash !== plan.source.hash)) {
    throw new OntologyGovernanceError("migration snapshot scope or source binding is invalid", "unavailable");
  }
  return items;
}
function assertCurrentSourceItem(db: Database.Database, item: SnapshotItem): void {
  const source = db.prepare(
    `SELECT vr.id
       FROM ontology_versioned_records vr
       JOIN ontology_derivative_validity derivative
         ON derivative.derivative_type = 'versioned_record'
        AND derivative.derivative_id = vr.id
        AND derivative.tenant_id = vr.tenant_id
        AND derivative.space_id = vr.space_id
        AND derivative.source_id = vr.source_id
        AND derivative.source_hash = vr.source_hash
        AND derivative.status = 'authoritative'
       JOIN ontology_source_lifecycle source_lifecycle
         ON source_lifecycle.tenant_id = vr.tenant_id
        AND source_lifecycle.space_id = vr.space_id
        AND source_lifecycle.source_id = vr.source_id
        AND source_lifecycle.source_hash = vr.source_hash
        AND source_lifecycle.status = 'active'
      WHERE vr.id = ? AND vr.tenant_id = ? AND vr.space_id = ?
        AND vr.record_type = ? AND vr.record_id = ? AND COALESCE(vr.legacy_type, vr.record_type) = ?
        AND vr.ontology_id = ? AND vr.ontology_version = ? AND vr.ontology_content_hash = ?
        AND vr.source_id = ? AND vr.source_hash = ?`
  ).get(
    item.sourceVersionedRecordId, item.tenantId, item.spaceId, item.recordType, item.recordId,
    item.sourceType, item.sourceOntologyId, item.sourceVersion, item.sourceHash, item.sourceId, item.sourceLifecycleHash
  );
  if (!source) throw new OntologyGovernanceError("migration snapshot source is stale, absent, or out of scope", "unavailable");
}
function assertPlanOntologyCoordinates(db: Database.Database, plan: OntologyMigrationPlan): ReturnType<typeof discoverOntology> {
  const source = discoverOntology(db, { ontologyId: plan.source.ontologyId, version: plan.source.version });
  const target = discoverOntology(db, { ontologyId: plan.target.ontologyId, version: plan.target.version });
  if (!source.globallyActive || source.contentHash !== plan.source.hash || !target.globallyActive || target.contentHash !== plan.target.hash) {
    throw new OntologyGovernanceError("migration source or target ontology is unavailable", "unavailable");
  }
  return target;
}
function executionCounts(db: Database.Database, plan: OntologyMigrationPlan): { migrated: number; reviewRequired: number } {
  const rows = db.prepare(
    `SELECT checkpoint.outcome
       FROM ontology_migration_snapshot_items item
       LEFT JOIN ontology_migration_checkpoints checkpoint ON checkpoint.snapshot_item_id = item.id
      WHERE item.snapshot_id = ?`
  ).all(plan.snapshot.id) as Array<{ outcome: string | null }>;
  const migrated = rows.filter((row) => row.outcome === "migrated").length;
  return { migrated, reviewRequired: rows.length - migrated };
}

export function planOntologyMigration(db: Database.Database, input: { tenantId: string; spaceId: string; source: { ontologyId: string; version: string; hash: string }; target: { ontologyId: string; version: string; hash: string }; mappings: Record<string, string[]>; actor: string }): OntologyMigrationPlan {
  const tenantId = clean(input.tenantId, "tenantId"); const spaceId = clean(input.spaceId, "spaceId"); const actor = clean(input.actor, "actor");
  const source = discoverOntology(db, { ontologyId: input.source.ontologyId, version: input.source.version });
  const target = discoverOntology(db, { ontologyId: input.target.ontologyId, version: input.target.version });
  if (!source.globallyActive || !target.globallyActive || source.contentHash !== input.source.hash || target.contentHash !== input.target.hash || !input.mappings || typeof input.mappings !== "object") throw new OntologyGovernanceError("migration source, target, or mappings are unavailable", "unavailable");
  for (const [sourceType, targets] of Object.entries(input.mappings)) {
    if (!isSafeVocabulary(sourceType) || !Array.isArray(targets) || !targets.every((targetType) => typeof targetType === "string" && isSafeVocabulary(targetType) && targetExists(db, target, targetType))) {
      throw new OntologyGovernanceError("migration mappings are malformed or unsupported", "invalid");
    }
  }
  const items = sourceInventory(db, { tenantId, spaceId, source: { ontologyId: source.ontologyId, version: source.version, hash: source.contentHash } });
  if (items.length === 0) throw new OntologyGovernanceError("migration source inventory is empty or unavailable", "unavailable");
  const snapshot = { id: `ontmigsnap_${randomUUID()}`, inventoryHash: inventoryHash(items), itemCount: items.length };
  const scopeHash = digest({ tenantId, spaceId });
  const planHash = digest({ tenantId, spaceId, source: { ontologyId: source.ontologyId, version: source.version, hash: source.contentHash }, target: { ontologyId: target.ontologyId, version: target.version, hash: target.contentHash }, mappings: input.mappings, inventoryHash: snapshot.inventoryHash, itemCount: snapshot.itemCount });
  const existing = db.prepare(`SELECT * FROM ontology_migration_plans WHERE tenant_id = ? AND space_id = ? AND plan_hash = ?`).get(tenantId, spaceId, planHash) as Record<string, string> | undefined;
  if (existing) return planFrom(db, existing);
  const plan: OntologyMigrationPlan = { id: `ontmig_${randomUUID()}`, tenantId, spaceId, source: { ontologyId: source.ontologyId, version: source.version, hash: source.contentHash }, target: { ontologyId: target.ontologyId, version: target.version, hash: target.contentHash }, mappings: input.mappings, planHash, status: "planned", snapshot };
  return commitAuditAtomic(db, { actor, eventType: "ontology_migration_planned", entityType: "ontology_migration_plan", entityId: plan.id, metadata: { plan_id: plan.id, tenant_id: tenantId, space_id: spaceId, source_hash: source.contentHash, target_hash: target.contentHash, plan_hash: planHash, mapping_count: Object.keys(input.mappings).length, snapshot_id: snapshot.id, inventory_hash: snapshot.inventoryHash, item_count: snapshot.itemCount }, body: () => {
    db.prepare(`INSERT INTO ontology_migration_plans (id, tenant_id, space_id, source_ontology_id, source_version, source_hash, target_ontology_id, target_version, target_hash, mappings_json, scope_hash, plan_hash, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`).run(plan.id, tenantId, spaceId, source.ontologyId, source.version, source.contentHash, target.ontologyId, target.version, target.contentHash, stable(input.mappings), scopeHash, planHash, actor, new Date().toISOString(), new Date().toISOString());
    db.prepare(`INSERT INTO ontology_migration_snapshots (id, plan_id, tenant_id, space_id, source_ontology_id, source_version, source_hash, inventory_hash, item_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(snapshot.id, plan.id, tenantId, spaceId, source.ontologyId, source.version, source.contentHash, snapshot.inventoryHash, snapshot.itemCount, actor, new Date().toISOString());
    const insertItem = db.prepare(`INSERT INTO ontology_migration_snapshot_items (id, snapshot_id, ordinal, tenant_id, space_id, record_type, record_id, source_type, source_ontology_id, source_version, source_hash, source_versioned_record_id, source_id, source_lifecycle_hash, source_record_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of items) {
      insertItem.run(item.id, snapshot.id, item.ordinal, item.tenantId, item.spaceId, item.recordType, item.recordId, item.sourceType, item.sourceOntologyId, item.sourceVersion, item.sourceHash, item.sourceVersionedRecordId, item.sourceId, item.sourceLifecycleHash, item.sourceRecordHash, new Date().toISOString());
    }
    return plan;
  } }).mutationResult as OntologyMigrationPlan;
}

export function approveOntologyMigration(db: Database.Database, input: { planId: string; tenantId: string; spaceId: string; planHash: string; actor: string }): OntologyMigrationPlan {
  const row = db.prepare(`SELECT * FROM ontology_migration_plans WHERE id = ? AND tenant_id = ? AND space_id = ?`).get(input.planId, input.tenantId, input.spaceId) as Record<string, string> | undefined;
  if (!row) throw new OntologyGovernanceError("migration plan not found in authorized scope", "not_found");
  const plan = planFrom(db, row);
  if (plan.status !== "planned" || plan.planHash !== input.planHash) throw new OntologyGovernanceError("migration approval requires the current planned hash", "conflict");
  assertPlanOntologyCoordinates(db, plan);
  loadSnapshotItems(db, plan);
  return commitAuditAtomic(db, { actor: clean(input.actor, "actor"), eventType: "ontology_migration_approved", entityType: "ontology_migration_plan", entityId: plan.id, metadata: { plan_id: plan.id, plan_hash: plan.planHash, source_hash: plan.source.hash, target_hash: plan.target.hash, snapshot_id: plan.snapshot.id, inventory_hash: plan.snapshot.inventoryHash, item_count: plan.snapshot.itemCount }, body: () => {
    db.prepare(`UPDATE ontology_migration_plans SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`).run(input.actor, new Date().toISOString(), new Date().toISOString(), plan.id);
    return { ...plan, status: "approved" as const };
  } }).mutationResult as OntologyMigrationPlan;
}

export function executeOntologyMigration(db: Database.Database, input: { planId: string; tenantId: string; spaceId: string; actor: string }): { plan: OntologyMigrationPlan; migrated: number; reviewRequired: number } {
  const row = db.prepare(`SELECT * FROM ontology_migration_plans WHERE id = ? AND tenant_id = ? AND space_id = ?`).get(input.planId, input.tenantId, input.spaceId) as Record<string, string> | undefined;
  if (!row) throw new OntologyGovernanceError("migration plan not found in authorized scope", "not_found");
  const plan = planFrom(db, row);
  const target = assertPlanOntologyCoordinates(db, plan);
  const items = loadSnapshotItems(db, plan);
  for (const item of items) assertCurrentSourceItem(db, item);
  if (plan.status === "completed") return { plan, ...executionCounts(db, plan) };
  if (plan.status !== "approved" && plan.status !== "incomplete") throw new OntologyGovernanceError("migration must be approved before execution", "conflict");

  for (const item of items) {
    const prior = db.prepare(`SELECT 1 FROM ontology_migration_checkpoints WHERE snapshot_item_id = ?`).get(item.id);
    if (prior) continue;
    const targets = plan.mappings[item.sourceType] ?? [];
    const targetType = targets.length === 1 ? targets[0] : null;
    const outcome = targetType ? "migrated" : targets.length > 1 ? "ambiguous" : "unsupported";
    const reason = targetType ? "single_supported_mapping" : targets.length > 1 ? "multiple_target_mappings" : "no_supported_mapping";
    const checkpointId = `ontmigchk_${randomUUID()}`;
    const versionedRecordId = targetType ? `ontrecord_${randomUUID()}` : null;
    commitAuditAtomic(db, {
      actor: clean(input.actor, "actor"),
      eventType: "ontology_migration_checkpointed",
      entityType: "ontology_migration_checkpoint",
      entityId: checkpointId,
      metadata: {
        plan_id: plan.id,
        snapshot_id: plan.snapshot.id,
        snapshot_item_id: item.id,
        inventory_hash: plan.snapshot.inventoryHash,
        record_type: item.recordType,
        record_id_hash: digest(item.recordId),
        source_ontology_id: item.sourceOntologyId,
        source_version: item.sourceVersion,
        source_hash: item.sourceHash,
        source_record_hash: item.sourceRecordHash,
        outcome,
      },
      body: () => {
        assertCurrentSourceItem(db, item);
        if (targetType) {
          const conflicting = db.prepare(
            `SELECT id, migration_snapshot_item_id FROM ontology_versioned_records
             WHERE tenant_id = ? AND space_id = ? AND record_type = ? AND record_id = ?
               AND ontology_content_hash = ?`
          ).get(plan.tenantId, plan.spaceId, item.recordType, item.recordId, target.contentHash) as { id: string; migration_snapshot_item_id: string | null } | undefined;
          if (conflicting) throw new OntologyGovernanceError("target versioned record is not bound to this migration snapshot", "conflict");
          db.prepare(`INSERT INTO ontology_versioned_records (id, tenant_id, space_id, record_type, record_id, qualified_type, ontology_id, ontology_version, ontology_content_hash, legacy_type, mapping_path_json, created_at, source_id, source_hash, migration_snapshot_id, migration_snapshot_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(versionedRecordId, plan.tenantId, plan.spaceId, item.recordType, item.recordId, targetType, target.ontologyId, target.version, target.contentHash, item.sourceType, stable([item.sourceRecordHash, targetType]), new Date().toISOString(), item.sourceId, item.sourceLifecycleHash, plan.snapshot.id, item.id);
          registerOntologyDerivative(db, { tenantId: plan.tenantId, spaceId: plan.spaceId, sourceId: item.sourceId, sourceHash: item.sourceLifecycleHash, derivativeType: "versioned_record", derivativeId: versionedRecordId! });
        }
        db.prepare(`INSERT INTO ontology_migration_checkpoints (id, plan_id, record_type, record_id, source_type, target_type, outcome, reason, created_at, snapshot_id, snapshot_item_id, source_ontology_id, source_version, source_hash, source_id, source_lifecycle_hash, source_record_hash, versioned_record_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(checkpointId, plan.id, item.recordType, item.recordId, item.sourceType, targetType, outcome, reason, new Date().toISOString(), plan.snapshot.id, item.id, item.sourceOntologyId, item.sourceVersion, item.sourceHash, item.sourceId, item.sourceLifecycleHash, item.sourceRecordHash, versionedRecordId);
      },
    });
  }

  const counts = executionCounts(db, plan);
  const status = counts.reviewRequired === 0 ? "completed" : "incomplete";
  return commitAuditAtomic(db, {
    actor: clean(input.actor, "actor"),
    eventType: "ontology_migration_execution_reconciled",
    entityType: "ontology_migration_plan",
    entityId: plan.id,
    metadata: {
      plan_id: plan.id,
      snapshot_id: plan.snapshot.id,
      inventory_hash: plan.snapshot.inventoryHash,
      item_count: plan.snapshot.itemCount,
      migrated: counts.migrated,
      review_required: counts.reviewRequired,
      status,
    },
    body: () => {
      db.prepare(`UPDATE ontology_migration_plans SET status = ?, updated_at = ? WHERE id = ?`).run(status, new Date().toISOString(), plan.id);
      return { plan: { ...plan, status: status as OntologyMigrationPlan["status"] }, ...counts };
    },
  }).mutationResult as { plan: OntologyMigrationPlan; migrated: number; reviewRequired: number };
}
