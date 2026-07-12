import { randomUUID } from "crypto";
import type Database from "better-sqlite3";

import { commitAuditAtomic } from "@/lib/skills/skill-audit-atomic";
import { OntologyGovernanceError } from "./candidates";
import { discoverOntology } from "./registry";

export type OntologyDerivativeType =
  | "candidate"
  | "promotion"
  | "canonical_definition"
  | "alias"
  | "versioned_record"
  | "provenance_binding";

export interface OntologyValidityContext extends Record<string, unknown> {
  ontologyId: string;
  ontologyVersion: string;
  ontologyContentHash: string;
  namespace: string;
  canonicalId: string;
  aliasMigrationPath: unknown[];
  sourceId: string;
  sourceHash: string;
  derivativeType: OntologyDerivativeType;
  derivativeId: string;
}

type SourceCoordinates = {
  tenantId: string;
  spaceId: string;
  sourceId: string;
  sourceHash: string;
};

function required(value: string, field: string): string {
  const cleaned = value?.trim();
  if (!cleaned) throw new OntologyGovernanceError(`${field} is required`, "invalid");
  return cleaned;
}

function sourceIsActive(db: Database.Database, source: SourceCoordinates): boolean {
  return Boolean(
    db.prepare(
      `SELECT 1 FROM ontology_source_lifecycle
       WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash = ? AND status = 'active'`
    ).get(source.tenantId, source.spaceId, source.sourceId, source.sourceHash)
  );
}

function derivativeIsAuthoritative(
  db: Database.Database,
  source: SourceCoordinates,
  derivativeType: OntologyDerivativeType,
  derivativeId: string
): boolean {
  return Boolean(
    db.prepare(
      `SELECT 1 FROM ontology_derivative_validity
       WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash = ?
         AND derivative_type = ? AND derivative_id = ? AND status = 'authoritative'`
    ).get(source.tenantId, source.spaceId, source.sourceId, source.sourceHash, derivativeType, derivativeId)
  );
}

function assertCurrentOntology(
  db: Database.Database,
  ontologyId: string,
  ontologyVersion: string,
  ontologyContentHash: string
): void {
  let ontology;
  try {
    ontology = discoverOntology(db, { ontologyId, version: ontologyVersion });
  } catch {
    throw new OntologyGovernanceError("ontology context is unavailable", "unavailable");
  }
  if (!ontology.globallyActive || ontology.contentHash !== ontologyContentHash) {
    throw new OntologyGovernanceError("ontology context is stale or unavailable", "unavailable");
  }
}

export function registerOntologySource(
  db: Database.Database,
  input: SourceCoordinates & { actor: string; reasonCode?: string }
): void {
  const source = {
    tenantId: required(input.tenantId, "tenantId"),
    spaceId: required(input.spaceId, "spaceId"),
    sourceId: required(input.sourceId, "sourceId"),
    sourceHash: required(input.sourceHash, "sourceHash"),
  };
  db.prepare(
    `INSERT INTO ontology_source_lifecycle
      (tenant_id, space_id, source_id, source_hash, status, updated_at, updated_by, reason_code)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
     ON CONFLICT(tenant_id, space_id, source_id, source_hash) DO UPDATE SET
       status = CASE WHEN ontology_source_lifecycle.status = 'active' THEN 'active' ELSE ontology_source_lifecycle.status END,
       updated_at = CASE WHEN ontology_source_lifecycle.status = 'active' THEN excluded.updated_at ELSE ontology_source_lifecycle.updated_at END,
       updated_by = CASE WHEN ontology_source_lifecycle.status = 'active' THEN excluded.updated_by ELSE ontology_source_lifecycle.updated_by END,
       reason_code = CASE WHEN ontology_source_lifecycle.status = 'active' THEN excluded.reason_code ELSE ontology_source_lifecycle.reason_code END`
  ).run(source.tenantId, source.spaceId, source.sourceId, source.sourceHash, new Date().toISOString(), required(input.actor, "actor"), input.reasonCode ?? "source_verified");
}

export function registerOntologyDerivative(
  db: Database.Database,
  input: SourceCoordinates & { derivativeType: OntologyDerivativeType; derivativeId: string }
): void {
  if (!sourceIsActive(db, input)) {
    throw new OntologyGovernanceError("source lifecycle is unavailable or revoked", "unavailable");
  }
  const derivativeId = required(input.derivativeId, "derivativeId");
  db.prepare(
    `INSERT INTO ontology_derivative_validity
      (id, tenant_id, space_id, source_id, source_hash, derivative_type, derivative_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'authoritative', ?)
     ON CONFLICT(derivative_type, derivative_id) DO UPDATE SET
       tenant_id = excluded.tenant_id, space_id = excluded.space_id, source_id = excluded.source_id,
       source_hash = excluded.source_hash, status = 'authoritative', revocation_reason = NULL, revoked_at = NULL`
  ).run(
    `ontvalid_${randomUUID()}`,
    input.tenantId,
    input.spaceId,
    input.sourceId,
    input.sourceHash,
    input.derivativeType,
    derivativeId,
    new Date().toISOString()
  );
}

export function revokeOntologySource(
  db: Database.Database,
  input: SourceCoordinates & { actor: string; reason: "source_changed" | "source_erased" }
): { revoked: number; reason: string } {
  const source = {
    tenantId: required(input.tenantId, "tenantId"),
    spaceId: required(input.spaceId, "spaceId"),
    sourceId: required(input.sourceId, "sourceId"),
    sourceHash: required(input.sourceHash, "sourceHash"),
  };
  const actor = required(input.actor, "actor");
  const now = new Date().toISOString();
  return commitAuditAtomic(db, {
    actor,
    eventType: "ontology_source_revoked",
    entityType: "ontology_source",
    entityId: `${source.sourceId}:${source.sourceHash}`,
    reason: input.reason,
    metadata: {
      tenant_id: source.tenantId,
      space_id: source.spaceId,
      source_id: source.sourceId,
      source_hash: source.sourceHash,
      reason: input.reason,
    },
    body: () => {
      db.prepare(
        `UPDATE ontology_source_lifecycle
         SET status = ?, updated_at = ?, updated_by = ?, reason_code = ?
         WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash = ? AND status = 'active'`
      ).run(input.reason === "source_erased" ? "erased" : "changed", now, actor, input.reason, source.tenantId, source.spaceId, source.sourceId, source.sourceHash);
      const update = db.prepare(
        `UPDATE ontology_derivative_validity
         SET status = 'revoked', revocation_reason = ?, revoked_at = ?
         WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash = ? AND status = 'authoritative'`
      ).run(input.reason, now, source.tenantId, source.spaceId, source.sourceId, source.sourceHash);
      db.prepare(
        `UPDATE ontology_candidates SET status = 'invalidated', invalidated_at = ?
         WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash = ? AND status IN ('pending','approved','deferred','promoted')`
      ).run(now, source.tenantId, source.spaceId, source.sourceId, source.sourceHash);
      return { revoked: update.changes, reason: input.reason };
    },
  }).mutationResult as { revoked: number; reason: string };
}

/** Used by approved erasure transactions, whose own audit receipt is the
 * authoritative evidence for this lifecycle transition. */
export function revokeOntologyDerivativesForErasedRecord(
  db: Database.Database,
  input: { tenantId: string; recordType: string; recordId: string; actor: string }
): number {
  const now = new Date().toISOString();
  const rows = db.prepare(
    `SELECT vr.id, v.tenant_id, v.space_id, v.source_id, v.source_hash
     FROM ontology_versioned_records vr
     JOIN ontology_derivative_validity v
       ON v.derivative_type = 'versioned_record' AND v.derivative_id = vr.id
     WHERE vr.tenant_id = ? AND vr.record_type = ? AND vr.record_id = ? AND v.status = 'authoritative'`
  ).all(input.tenantId, input.recordType, input.recordId) as Array<{
    id: string; tenant_id: string; space_id: string; source_id: string; source_hash: string;
  }>;
  let revoked = 0;
  for (const row of rows) {
    revoked += db.prepare(
      `UPDATE ontology_derivative_validity
       SET status = 'revoked', revocation_reason = 'source_erased', revoked_at = ?
       WHERE derivative_type = 'versioned_record' AND derivative_id = ? AND status = 'authoritative'`
    ).run(now, row.id).changes;
  }
  return revoked;
}

export function resolveOntologyValidity(
  db: Database.Database,
  input: { tenantId: string; spaceId: string; recordType: string; recordId: string }
): OntologyValidityContext {
  const tenantId = required(input.tenantId, "tenantId");
  const spaceId = required(input.spaceId, "spaceId");
  const recordType = required(input.recordType, "recordType");
  const recordId = required(input.recordId, "recordId");
  const row = db.prepare(
    `SELECT * FROM ontology_versioned_records
     WHERE tenant_id = ? AND space_id = ? AND record_type = ? AND record_id = ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(tenantId, spaceId, recordType, recordId) as Record<string, string> | undefined;
  if (!row || !row.source_id || !row.source_hash) {
    throw new OntologyGovernanceError("ontology context is unavailable", "unavailable");
  }
  const source = { tenantId, spaceId, sourceId: row.source_id, sourceHash: row.source_hash };
  if (!sourceIsActive(db, source) || !derivativeIsAuthoritative(db, source, "versioned_record", row.id)) {
    throw new OntologyGovernanceError("ontology context is revoked or unverified", "unavailable");
  }
  assertCurrentOntology(db, row.ontology_id, row.ontology_version, row.ontology_content_hash);
  return {
    ontologyId: row.ontology_id,
    ontologyVersion: row.ontology_version,
    ontologyContentHash: row.ontology_content_hash,
    namespace: row.qualified_type.split(".").slice(0, -1).join("."),
    canonicalId: row.qualified_type,
    aliasMigrationPath: JSON.parse(row.mapping_path_json) as unknown[],
    sourceId: source.sourceId,
    sourceHash: source.sourceHash,
    derivativeType: "versioned_record",
    derivativeId: row.id,
  };
}

export function assertCandidateAuthoritative(
  db: Database.Database,
  input: { tenantId: string; spaceId: string; candidateId: string }
): void {
  const row = db.prepare(
    `SELECT source_id, source_hash, status FROM ontology_candidates WHERE id = ? AND tenant_id = ? AND space_id = ?`
  ).get(input.candidateId, input.tenantId, input.spaceId) as { source_id: string; source_hash: string; status: string } | undefined;
  if (!row || row.status !== "approved") {
    throw new OntologyGovernanceError("candidate is not authoritative", "unavailable");
  }
  const source = { tenantId: input.tenantId, spaceId: input.spaceId, sourceId: row.source_id, sourceHash: row.source_hash };
  if (!sourceIsActive(db, source) || !derivativeIsAuthoritative(db, source, "candidate", input.candidateId)) {
    throw new OntologyGovernanceError("candidate source is revoked or unverified", "unavailable");
  }
}

export function sourceForCanonicalDefinition(
  db: Database.Database,
  input: { ontologyId: string; ontologyVersion: string; namespace: string; canonicalId: string }
): SourceCoordinates | null {
  const row = db.prepare(
    `SELECT c.tenant_id, c.space_id, c.source_id, c.source_hash, d.id AS definition_id
     FROM ontology_canonical_definitions d
     JOIN ontology_promotions p ON p.id = d.promotion_id
     JOIN ontology_candidates c ON c.id = p.candidate_id
     WHERE d.ontology_id = ? AND d.ontology_version = ? AND d.namespace = ? AND d.canonical_id = ?`
  ).get(input.ontologyId, input.ontologyVersion, input.namespace, input.canonicalId) as ({
    tenant_id: string; space_id: string; source_id: string; source_hash: string; definition_id: string;
  }) | undefined;
  if (!row) return null;
  const source = { tenantId: row.tenant_id, spaceId: row.space_id, sourceId: row.source_id, sourceHash: row.source_hash };
  if (!sourceIsActive(db, source) || !derivativeIsAuthoritative(db, source, "canonical_definition", row.definition_id)) {
    return null;
  }
  return source;
}
