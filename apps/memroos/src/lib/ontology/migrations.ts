import { createHash, randomUUID } from "crypto";
import type Database from "better-sqlite3";

import { commitAuditAtomic } from "@/lib/skills/skill-audit-atomic";
import { OntologyGovernanceError } from "./candidates";
import { discoverOntology } from "./registry";

export interface OntologyMigrationPlan {
  id: string;
  tenantId: string;
  spaceId: string;
  source: { ontologyId: string; version: string; hash: string };
  target: { ontologyId: string; version: string; hash: string };
  mappings: Record<string, string[]>;
  planHash: string;
  status: "planned" | "approved" | "executing" | "incomplete" | "completed" | "rejected";
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`; }
function clean(value: string, field: string): string { const result = value?.trim(); if (!result) throw new OntologyGovernanceError(`${field} is required`, "invalid"); return result; }
function planFrom(row: Record<string, string>): OntologyMigrationPlan {
  return { id: row.id, tenantId: row.tenant_id, spaceId: row.space_id, source: { ontologyId: row.source_ontology_id, version: row.source_version, hash: row.source_hash }, target: { ontologyId: row.target_ontology_id, version: row.target_version, hash: row.target_hash }, mappings: JSON.parse(row.mappings_json) as Record<string, string[]>, planHash: row.plan_hash, status: row.status as OntologyMigrationPlan["status"] };
}
function isSafeVocabulary(value: string): boolean { return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value); }
function targetExists(db: Database.Database, ontology: ReturnType<typeof discoverOntology>, targetType: string): boolean {
  return ontology.definitions.some((definition) => definition.id === targetType)
    || Boolean(db.prepare(`SELECT 1 FROM ontology_canonical_definitions WHERE ontology_id = ? AND ontology_version = ? AND canonical_id = ?`).get(ontology.ontologyId, ontology.version, targetType));
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
  const scopeHash = digest({ tenantId, spaceId });
  const planHash = digest({ tenantId, spaceId, source: input.source, target: input.target, mappings: input.mappings });
  const existing = db.prepare(`SELECT * FROM ontology_migration_plans WHERE tenant_id = ? AND space_id = ? AND plan_hash = ?`).get(tenantId, spaceId, planHash) as Record<string, string> | undefined;
  if (existing) return planFrom(existing);
  const plan: OntologyMigrationPlan = { id: `ontmig_${randomUUID()}`, tenantId, spaceId, source: input.source, target: input.target, mappings: input.mappings, planHash, status: "planned" };
  return commitAuditAtomic(db, { actor, eventType: "ontology_migration_planned", entityType: "ontology_migration_plan", entityId: plan.id, metadata: { plan_id: plan.id, tenant_id: tenantId, space_id: spaceId, source_hash: source.contentHash, target_hash: target.contentHash, plan_hash: planHash, mapping_count: Object.keys(input.mappings).length }, body: () => {
    db.prepare(`INSERT INTO ontology_migration_plans (id, tenant_id, space_id, source_ontology_id, source_version, source_hash, target_ontology_id, target_version, target_hash, mappings_json, scope_hash, plan_hash, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`).run(plan.id, tenantId, spaceId, source.ontologyId, source.version, source.contentHash, target.ontologyId, target.version, target.contentHash, stable(input.mappings), scopeHash, planHash, actor, new Date().toISOString(), new Date().toISOString());
    return plan;
  } }).mutationResult as OntologyMigrationPlan;
}

export function approveOntologyMigration(db: Database.Database, input: { planId: string; tenantId: string; spaceId: string; planHash: string; actor: string }): OntologyMigrationPlan {
  const row = db.prepare(`SELECT * FROM ontology_migration_plans WHERE id = ? AND tenant_id = ? AND space_id = ?`).get(input.planId, input.tenantId, input.spaceId) as Record<string, string> | undefined;
  if (!row) throw new OntologyGovernanceError("migration plan not found in authorized scope", "not_found");
  const plan = planFrom(row);
  if (plan.status !== "planned" || plan.planHash !== input.planHash) throw new OntologyGovernanceError("migration approval requires the current planned hash", "conflict");
  return commitAuditAtomic(db, { actor: clean(input.actor, "actor"), eventType: "ontology_migration_approved", entityType: "ontology_migration_plan", entityId: plan.id, metadata: { plan_id: plan.id, plan_hash: plan.planHash, source_hash: plan.source.hash, target_hash: plan.target.hash }, body: () => {
    db.prepare(`UPDATE ontology_migration_plans SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`).run(input.actor, new Date().toISOString(), new Date().toISOString(), plan.id);
    return { ...plan, status: "approved" as const };
  } }).mutationResult as OntologyMigrationPlan;
}

export function executeOntologyMigration(db: Database.Database, input: { planId: string; tenantId: string; spaceId: string; actor: string; records: Array<{ recordType: string; recordId: string; sourceType: string }> }): { plan: OntologyMigrationPlan; migrated: number; reviewRequired: number } {
  const row = db.prepare(`SELECT * FROM ontology_migration_plans WHERE id = ? AND tenant_id = ? AND space_id = ?`).get(input.planId, input.tenantId, input.spaceId) as Record<string, string> | undefined;
  if (!row) throw new OntologyGovernanceError("migration plan not found in authorized scope", "not_found");
  const plan = planFrom(row);
  const target = discoverOntology(db, { ontologyId: plan.target.ontologyId, version: plan.target.version });
  if (plan.status !== "approved" && plan.status !== "incomplete") throw new OntologyGovernanceError("migration must be approved before execution", "conflict");
  if (!target.globallyActive || target.contentHash !== plan.target.hash) throw new OntologyGovernanceError("target ontology is unavailable", "unavailable");
  let migrated = 0; let reviewRequired = 0; const now = new Date().toISOString();
  const result = commitAuditAtomic(db, { actor: clean(input.actor, "actor"), eventType: "ontology_migration_executed", entityType: "ontology_migration_plan", entityId: plan.id, metadata: { plan_id: plan.id, plan_hash: plan.planHash, record_count: input.records.length, source_hash: plan.source.hash, target_hash: plan.target.hash }, body: () => {
    db.prepare(`UPDATE ontology_migration_plans SET status = 'executing', updated_at = ? WHERE id = ?`).run(now, plan.id);
    for (const record of input.records) {
      const prior = db.prepare(`SELECT 1 FROM ontology_migration_checkpoints WHERE plan_id = ? AND record_type = ? AND record_id = ?`).get(plan.id, record.recordType, record.recordId);
      if (prior) continue;
      if (!isSafeVocabulary(record.recordType) || !isSafeVocabulary(record.sourceType) || !/^[A-Za-z0-9._:-]{1,128}$/.test(record.recordId)) {
        throw new OntologyGovernanceError("migration record identity is malformed", "invalid");
      }
      const targets = plan.mappings[record.sourceType] ?? [];
      const targetType = targets.length === 1 ? targets[0] : null;
      const outcome = targetType ? "migrated" : targets.length > 1 ? "ambiguous" : "unsupported";
      const reason = targetType ? "single_supported_mapping" : targets.length > 1 ? "multiple_target_mappings" : "no_supported_mapping";
      db.prepare(`INSERT INTO ontology_migration_checkpoints (id, plan_id, record_type, record_id, source_type, target_type, outcome, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`ontmigchk_${randomUUID()}`, plan.id, record.recordType, record.recordId, record.sourceType, targetType, outcome, reason, now);
      if (!targetType) { reviewRequired += 1; continue; }
      db.prepare(`INSERT OR IGNORE INTO ontology_versioned_records (id, tenant_id, space_id, record_type, record_id, qualified_type, ontology_id, ontology_version, ontology_content_hash, legacy_type, mapping_path_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`ontrecord_${randomUUID()}`, plan.tenantId, plan.spaceId, record.recordType, record.recordId, targetType, target.ontologyId, target.version, target.contentHash, record.sourceType, stable([digest(record.sourceType), targetType]), now);
      migrated += 1;
    }
    const status = reviewRequired ? "incomplete" : "completed";
    db.prepare(`UPDATE ontology_migration_plans SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, plan.id);
    return { plan: { ...plan, status: status as OntologyMigrationPlan["status"] }, migrated, reviewRequired };
  } });
  return result.mutationResult as { plan: OntologyMigrationPlan; migrated: number; reviewRequired: number };
}
