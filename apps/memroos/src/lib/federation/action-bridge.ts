import crypto from "crypto";
import type Database from "better-sqlite3";

import { resolveOntologyValidity, type OntologyValidityContext } from "@/lib/ontology/validity";

type JsonRecord = Record<string, unknown>;

export type FederationActionBridgeStatus =
  | "ready"
  | "denied"
  | "unavailable"
  | "persistence_failed";

export interface FederationActionArtifact {
  id: string;
  tenantId: string;
  spaceId: string;
  federationRunId: string;
  packHash: string;
  artifactHash: string;
  policyHash: string;
  ontologyHash: string;
  sourceIds: string[];
  outcomeIds: string[];
}

export type FederationActionBridgeResult =
  | { status: "ready"; artifact: FederationActionArtifact }
  | { status: Exclude<FederationActionBridgeStatus, "ready">; reason: string };

export interface FederationActionBridgeInput {
  tenantId: string;
  spaceId: string;
  federationRunId: string;
  packHash: string;
  /** The ontology records whose server-derived validity is required. */
  ontologyRecords: Array<{ recordType: string; recordId: string }>;
}

type MergeRow = {
  pack_hash: string;
  pack_bytes: number;
  pack_item_count: number;
  contributing_source_ids: string;
  contributing_outcome_ids: string;
  bound_status: string;
  scope_hash: string;
};

type OutcomeRow = {
  id: string;
  source_id: string;
  outcome: string;
  policy_decision: string;
  policy_version: string | null;
  scope_hash: string;
};

function required(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseIds(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) return null;
    return [...new Set(parsed.map((item) => item.trim()))].sort();
  } catch {
    return null;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function validateInput(input: FederationActionBridgeInput): string | null {
  if (!required(input.tenantId) || !required(input.spaceId)) return "scope_unavailable";
  if (!required(input.federationRunId) || !required(input.packHash)) return "federation_receipt_missing";
  if (!Array.isArray(input.ontologyRecords) || input.ontologyRecords.length === 0) return "ontology_context_unavailable";
  if (input.ontologyRecords.some((record) => !required(record.recordType) || !required(record.recordId))) {
    return "ontology_context_unavailable";
  }
  return null;
}

function findMerge(db: Database.Database, input: FederationActionBridgeInput): MergeRow | null {
  return (db.prepare(
    `SELECT pack_hash, pack_bytes, pack_item_count, contributing_source_ids, contributing_outcome_ids, bound_status, scope_hash
     FROM federation_merges
     WHERE tenant_id = ? AND federation_run_id = ? AND pack_hash = ?`
  ).get(input.tenantId, input.federationRunId, input.packHash) as MergeRow | undefined) ?? null;
}

function sourceIsCurrent(db: Database.Database, tenantId: string, spaceId: string, sourceId: string): boolean {
  const row = db.prepare(
    `SELECT 1
       FROM federation_sources
      WHERE id = ? AND tenant_id = ? AND space_id = ? AND enabled = 1
        AND trust_level IN ('registered','trusted')
        AND (has_expiry = 0 OR expires_at IS NOT NULL AND expires_at > ?)`
  ).get(sourceId, tenantId, spaceId, new Date().toISOString());
  return Boolean(row);
}

function loadOutcomes(
  db: Database.Database,
  input: FederationActionBridgeInput,
  outcomeIds: string[],
  sourceIds: string[],
  expectedScopeHash: string,
): OutcomeRow[] | null {
  if (outcomeIds.length === 0 || sourceIds.length === 0) return null;
  const rows = db.prepare(
    `SELECT id, source_id, outcome, policy_decision, policy_version, scope_hash
       FROM federation_source_outcomes
      WHERE tenant_id = ? AND federation_run_id = ?`
  ).all(input.tenantId, input.federationRunId) as OutcomeRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const selected = outcomeIds.map((id) => byId.get(id));
  if (selected.some((item) => !item)) return null;
  const outcomes = selected as OutcomeRow[];
  if (
    outcomes.some((outcome) =>
      outcome.outcome !== "success"
      || outcome.policy_decision !== "allow"
      || outcome.scope_hash !== expectedScopeHash
      || !sourceIds.includes(outcome.source_id)
      || !sourceIsCurrent(db, input.tenantId, input.spaceId, outcome.source_id)
    )
  ) {
    return null;
  }
  const outcomeSourceIds = [...new Set(outcomes.map((outcome) => outcome.source_id))].sort();
  if (outcomeSourceIds.length !== sourceIds.length || outcomeSourceIds.some((sourceId, index) => sourceId !== sourceIds[index])) {
    return null;
  }
  return outcomes;
}

function resolveOntology(
  db: Database.Database,
  input: FederationActionBridgeInput,
): OntologyValidityContext[] | null {
  try {
    return input.ontologyRecords.map((record) => resolveOntologyValidity(db, {
      tenantId: input.tenantId,
      spaceId: input.spaceId,
      recordType: record.recordType,
      recordId: record.recordId,
    }));
  } catch {
    return null;
  }
}

function artifactFromRow(row: Record<string, unknown>): FederationActionArtifact {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    spaceId: String(row.space_id),
    federationRunId: String(row.federation_run_id),
    packHash: String(row.pack_hash),
    artifactHash: String(row.artifact_hash),
    policyHash: String(row.policy_hash),
    ontologyHash: String(row.ontology_hash),
    sourceIds: parseIds(String(row.source_ids_json)) ?? [],
    outcomeIds: parseIds(String(row.outcome_ids_json)) ?? [],
  };
}

/**
 * Resolve and persist an application-controlled federation action receipt.
 * Caller hashes are deliberately not accepted. Every hash below is derived
 * from persisted federation rows or server-resolved ontology context.
 */
export function persistFederationActionArtifact(
  db: Database.Database,
  input: FederationActionBridgeInput,
): FederationActionBridgeResult {
  const invalidInput = validateInput(input);
  if (invalidInput) return { status: "denied", reason: invalidInput };
  const merge = findMerge(db, input);
  if (!merge) return { status: "unavailable", reason: "federation_merge_unavailable" };
  if (merge.bound_status !== "bounded" && merge.bound_status !== "partial_bounded") {
    return { status: "denied", reason: "federation_pack_unbounded" };
  }
  if (merge.pack_item_count <= 0 || merge.pack_bytes <= 0) return { status: "denied", reason: "federation_pack_empty" };
  const sourceIds = parseIds(merge.contributing_source_ids);
  const outcomeIds = parseIds(merge.contributing_outcome_ids);
  if (!sourceIds || !outcomeIds) return { status: "unavailable", reason: "federation_merge_malformed" };
  const outcomes = loadOutcomes(db, input, outcomeIds, sourceIds, merge.scope_hash);
  if (!outcomes) return { status: "unavailable", reason: "federation_outcome_or_source_unavailable" };
  const ontology = resolveOntology(db, input);
  if (!ontology) return { status: "unavailable", reason: "ontology_context_unavailable" };

  const policyHash = sha256(outcomes.map((outcome) => ({
    id: outcome.id,
    sourceId: outcome.source_id,
    decision: outcome.policy_decision,
    version: outcome.policy_version,
    scopeHash: outcome.scope_hash,
  })));
  const ontologyRefs = ontology.map((item, index) => ({
    recordType: input.ontologyRecords[index]?.recordType,
    recordId: input.ontologyRecords[index]?.recordId,
    ontologyId: item.ontologyId,
    ontologyVersion: item.ontologyVersion,
    ontologyContentHash: item.ontologyContentHash,
    canonicalId: item.canonicalId,
    sourceId: item.sourceId,
    sourceHash: item.sourceHash,
    derivativeId: item.derivativeId,
  }));
  const ontologyHash = sha256(ontologyRefs);
  const artifactHash = sha256({
    tenantId: input.tenantId,
    spaceId: input.spaceId,
    federationRunId: input.federationRunId,
    packHash: merge.pack_hash,
    packBytes: merge.pack_bytes,
    packItemCount: merge.pack_item_count,
    boundStatus: merge.bound_status,
    scopeHash: merge.scope_hash,
    sourceIds,
    outcomeIds,
    policyHash,
    ontologyHash,
  });
  let existing: Record<string, unknown> | undefined;
  try {
    existing = db.prepare(
      `SELECT * FROM federation_action_artifacts
        WHERE tenant_id = ? AND federation_run_id = ? AND pack_hash = ?`
    ).get(input.tenantId, input.federationRunId, input.packHash) as Record<string, unknown> | undefined;
  } catch {
    return { status: "persistence_failed", reason: "federation_artifact_persistence_failed" };
  }
  if (existing) {
    if (existing.status !== "active") return { status: "unavailable", reason: "federation_artifact_invalidated" };
    if (String(existing.space_id) !== input.spaceId || String(existing.artifact_hash) !== artifactHash) {
      return { status: "denied", reason: "federation_artifact_mismatch" };
    }
    return { status: "ready", artifact: artifactFromRow(existing) };
  }

  const id = `federation_action_${crypto.randomUUID()}`;
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO federation_action_artifacts
          (id, tenant_id, space_id, federation_run_id, pack_hash, pack_bytes, pack_item_count,
           bound_status, scope_hash, policy_hash, ontology_hash, ontology_refs_json,
           source_ids_json, outcome_ids_json, artifact_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(
        id, input.tenantId, input.spaceId, input.federationRunId, merge.pack_hash, merge.pack_bytes,
        merge.pack_item_count, merge.bound_status, merge.scope_hash, policyHash, ontologyHash,
        canonical(ontologyRefs), canonical(sourceIds), canonical(outcomeIds), artifactHash,
        new Date().toISOString(), new Date().toISOString(),
      );
    })();
  } catch {
    return { status: "persistence_failed", reason: "federation_artifact_persistence_failed" };
  }
  return {
    status: "ready",
    artifact: { id, tenantId: input.tenantId, spaceId: input.spaceId, federationRunId: input.federationRunId, packHash: merge.pack_hash, artifactHash, policyHash, ontologyHash, sourceIds, outcomeIds },
  };
}

/** Revalidates persisted proof immediately before a proxy call, then returns
 * only a safe reference envelope for Python. */
export function resolveFederationActionProof(
  db: Database.Database,
  input: { tenantId: string; spaceId: string; artifactId: string },
): FederationActionBridgeResult {
  const row = db.prepare(
    `SELECT * FROM federation_action_artifacts WHERE id = ? AND tenant_id = ? AND space_id = ?`
  ).get(input.artifactId, input.tenantId, input.spaceId) as Record<string, unknown> | undefined;
  if (!row) return { status: "unavailable", reason: "federation_artifact_unavailable" };
  if (row.status !== "active") return { status: "unavailable", reason: "federation_artifact_invalidated" };
  const sourceIds = parseIds(String(row.source_ids_json));
  if (!sourceIds || sourceIds.some((sourceId) => !sourceIsCurrent(db, input.tenantId, input.spaceId, sourceId))) {
    return { status: "unavailable", reason: "federation_source_unavailable" };
  }
  let ontologyRefs: Array<{ recordType: string; recordId: string }>;
  try {
    ontologyRefs = JSON.parse(String(row.ontology_refs_json)) as Array<{ recordType: string; recordId: string }>;
  } catch {
    return { status: "unavailable", reason: "ontology_context_unavailable" };
  }
  if (
    !Array.isArray(ontologyRefs)
    || ontologyRefs.length === 0
    || ontologyRefs.some((reference) => !required(reference.recordType) || !required(reference.recordId))
    || !resolveOntology(db, {
      tenantId: input.tenantId,
      spaceId: input.spaceId,
      federationRunId: String(row.federation_run_id),
      packHash: String(row.pack_hash),
      ontologyRecords: ontologyRefs,
    })
  ) {
    return { status: "unavailable", reason: "ontology_context_unavailable" };
  }
  return { status: "ready", artifact: artifactFromRow(row) };
}

/** Register only the safe canonical/source coordinates of results that made
 * the persisted pack. This is the erasure traversal index, not a payload
 * store. Callers must already hold the application-controlled artifact. */
export function registerFederationActionDerivatives(
  db: Database.Database,
  input: {
    tenantId: string;
    artifactId: string;
    derivatives: Array<{ canonicalId: string; canonicalHash: string; sourceId: string }>;
  },
): FederationActionBridgeResult {
  const artifact = db.prepare(
    `SELECT * FROM federation_action_artifacts WHERE id = ? AND tenant_id = ? AND status = 'active'`
  ).get(input.artifactId, input.tenantId) as Record<string, unknown> | undefined;
  if (!artifact) return { status: "unavailable", reason: "federation_artifact_unavailable" };
  const sourceIds = parseIds(String(artifact.source_ids_json));
  if (!sourceIds || !Array.isArray(input.derivatives) || input.derivatives.length === 0) {
    return { status: "denied", reason: "federation_derivative_input_invalid" };
  }
  if (input.derivatives.some((item) =>
    !required(item.canonicalId)
    || !required(item.canonicalHash)
    || !sourceIds.includes(item.sourceId)
  )) {
    return { status: "denied", reason: "federation_derivative_scope_invalid" };
  }
  try {
    const insert = db.prepare(
      `INSERT INTO federation_action_derivatives
        (id, tenant_id, artifact_id, canonical_id, canonical_hash, source_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT(tenant_id, artifact_id, canonical_hash, source_id) DO NOTHING`
    );
    db.transaction(() => {
      for (const derivative of input.derivatives) {
        insert.run(
          `federation_derivative_${crypto.randomUUID()}`,
          input.tenantId,
          input.artifactId,
          derivative.canonicalId,
          derivative.canonicalHash,
          derivative.sourceId,
          new Date().toISOString(),
        );
      }
    })();
  } catch {
    return { status: "persistence_failed", reason: "federation_derivative_persistence_failed" };
  }
  return { status: "ready", artifact: artifactFromRow(artifact) };
}

/** Invalidate only future bridge use. It never edits orchestration lineage or
 * previously published bundle hashes. */
export function invalidateFederationArtifactsForCanonical(
  db: Database.Database,
  input: { tenantId: string; canonicalId: string; erasureId: string },
): { invalidated: number; artifacts: number } {
  const now = new Date().toISOString();
  const rows = db.prepare(
    `SELECT DISTINCT artifact_id FROM federation_action_derivatives
      WHERE tenant_id = ? AND canonical_id = ? AND status = 'active'`
  ).all(input.tenantId, input.canonicalId) as Array<{ artifact_id: string }>;
  const invalidateDerivative = db.prepare(
    `UPDATE federation_action_derivatives
        SET status = 'invalidated', invalidated_at = ?, erasure_id = ?
      WHERE tenant_id = ? AND canonical_id = ? AND status = 'active'`
  );
  const invalidateArtifact = db.prepare(
    `UPDATE federation_action_artifacts
        SET status = 'invalidated', invalidation_reason = 'source_erased', invalidated_at = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND status = 'active'`
  );
  db.transaction(() => {
    invalidateDerivative.run(now, input.erasureId, input.tenantId, input.canonicalId);
    for (const row of rows) invalidateArtifact.run(now, now, row.artifact_id, input.tenantId);
  })();
  return { invalidated: rows.length, artifacts: rows.length };
}

/** Source registration erasure is distinct from a canonical-subject erasure.
 * It invalidates active artifacts that cite the source, while preserving all
 * already-created orchestration evidence and its immutable bundle hashes. */
export function invalidateFederationArtifactsForSource(
  db: Database.Database,
  input: { tenantId: string; sourceId: string; erasureId: string },
): { invalidated: number; artifacts: number } {
  const now = new Date().toISOString();
  const rows = db.prepare(
    `SELECT DISTINCT artifact_id FROM federation_action_derivatives
      WHERE tenant_id = ? AND source_id = ? AND status = 'active'`
  ).all(input.tenantId, input.sourceId) as Array<{ artifact_id: string }>;
  const invalidateDerivative = db.prepare(
    `UPDATE federation_action_derivatives
        SET status = 'invalidated', invalidated_at = ?, erasure_id = ?
      WHERE tenant_id = ? AND source_id = ? AND status = 'active'`
  );
  const invalidateArtifact = db.prepare(
    `UPDATE federation_action_artifacts
        SET status = 'invalidated', invalidation_reason = 'source_erased', invalidated_at = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND status = 'active'`
  );
  db.transaction(() => {
    invalidateDerivative.run(now, input.erasureId, input.tenantId, input.sourceId);
    for (const row of rows) invalidateArtifact.run(now, now, row.artifact_id, input.tenantId);
  })();
  return { invalidated: rows.length, artifacts: rows.length };
}
