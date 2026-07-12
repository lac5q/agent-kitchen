import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import { coordinateErasure, type ErasureReport, type ErasureStoreOutcome } from "./erasure";
import { activeLegalHoldsForRecord, type LegalHoldRow } from "./retention-expiry";
import {
  parseJsonObject,
  scopeHash,
  sha256Hex,
  stableJson,
  type RetentionRecordRow,
  type RetentionScope,
} from "./retention-policy";
import type { CanonicalDerivative, CanonicalMemoryIdentity } from "./canonical";
import { revokeOntologyDerivativesForErasedRecord } from "../ontology/validity";

export type SubjectPlanStatus =
  | "planned"
  | "approved"
  | "executing"
  | "completed"
  | "incomplete"
  | "blocked"
  | "failed"
  | "denied"
  | "ambiguous";

export interface SubjectSelector {
  subjectId?: string;
  userId?: string;
  emailHash?: string;
  externalId?: string;
  canonicalId?: string;
  recordId?: string;
  name?: string;
  [key: string]: unknown;
}

export interface SubjectDerivativeInventory extends CanonicalDerivative {
  action: "purge" | "tombstone" | "zero_match";
  reason: string;
}

export interface SubjectRecordTarget {
  canonicalId: string;
  canonicalHash: string;
  recordType: string;
  recordId: string;
  recordIdHash: string;
  ontologyType: string;
  tier: string;
  linkReasons: string[];
  derivatives: SubjectDerivativeInventory[];
  held: boolean;
  holdIds: string[];
  policy: {
    policyId: string | null;
    policyVersion: string | null;
    retentionDeadline: string | null;
    retentionStatus: string;
  };
}

export interface SubjectPlanEvidence {
  tenantId: string;
  subjectHash: string;
  selectorHashes: Record<string, string>;
  scope: RetentionScope;
  scopeHash: string;
  status: "planned" | "denied" | "ambiguous";
  reason: string;
  matchedRecords: SubjectRecordTarget[];
  excludedRecords: Array<{ recordType: string; recordIdHash: string; reason: string }>;
  candidates: Array<{ candidateHash: string; recordCount: number; canonicalIds: string[] }>;
  holds: Array<{ holdId: string; recordType: string; recordId: string; reasonCodeHash: string }>;
  coverage: Array<{ canonicalId: string; storeId: string; action: string; reason: string }>;
  policy: { requiredReview: boolean; executionRequiresCurrentHash: boolean; rawPayloadExcluded: true };
  estimatedEffects: { targetCount: number; heldCount: number; purgeCount: number; tombstoneCount: number; zeroMatchCount: number };
  sourceVersionHash: string;
  planHash: string;
  createdAt: string;
}

export interface SubjectErasurePlanRow {
  id: string;
  tenant_id: string;
  subject_hash: string;
  selector_hashes_json: string;
  status: SubjectPlanStatus;
  scope_json: string;
  scope_hash: string;
  matched_records_json: string;
  excluded_records_json: string;
  coverage_json: string;
  holds_json: string;
  policy_json: string;
  estimated_effects_json: string;
  plan_hash: string;
  source_version_hash: string;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  executed_by: string | null;
  executed_at: string | null;
  result_json: string | null;
  updated_at: string;
}

export interface SubjectPlanResult {
  ok: boolean;
  status: SubjectPlanStatus;
  reason: string;
  plan: (SubjectPlanEvidence & { id: string }) | null;
  candidates: SubjectPlanEvidence["candidates"];
}

export interface SubjectExecutionResult {
  ok: boolean;
  planId: string;
  status: "completed" | "incomplete" | "blocked" | "failed";
  erased: number;
  blocked: number;
  failed: number;
  storeOutcomes: Array<{ canonicalId: string; outcomes: ErasureStoreOutcome[] }>;
  heldBlockers: SubjectRecordTarget[];
  planHash: string;
}

const EXACT_SUBJECT_FIELDS = ["subjectId", "userId", "emailHash", "externalId", "canonicalId", "recordId"];
const SUBJECT_FIELD_ALIASES: Record<string, string[]> = {
  subjectId: ["subjectId", "subject_id", "personId", "person_id", "contactSubjectId", "contact_subject_id"],
  userId: ["userId", "user_id", "ownerId", "owner_id", "personUserId", "person_user_id"],
  emailHash: ["emailHash", "email_hash", "emailSha256", "email_sha256"],
  externalId: ["externalId", "external_id", "contactId", "contact_id", "platformId", "platform_id"],
  canonicalId: ["canonicalId", "canonical_id", "canonicalSubjectId", "canonical_subject_id"],
  recordId: ["recordId", "record_id"],
  name: ["name", "subjectName", "subject_name", "displayName", "display_name"],
};

const KNOWN_STORES = ["message", "vector", "graph", "fts", "qmd", "cache", "context", "candidates", "platform", "embeddings", "vault", "salience", "federation"];

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function ensureNonEmpty(value: string | undefined | null, field: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

function objectEntries(value: Record<string, unknown> | null | undefined): Array<[string, unknown]> {
  return Object.entries(value ?? {}).filter(([, child]) => child !== undefined && child !== null && child !== "");
}

function hashValue(value: unknown): string {
  return sha256Hex(stableJson(value));
}

function hashSelectorFields(selector: SubjectSelector): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const field of [...EXACT_SUBJECT_FIELDS, "name"]) {
    const value = selector[field];
    if (typeof value === "string" && value.trim()) hashes[field] = hashValue(value.trim());
  }
  return hashes;
}

function hasCompleteScope(scope: RetentionScope | null | undefined): string | null {
  if (!scope || objectEntries(scope).length === 0) return "missing_scope";
  if (typeof scope.tenantId !== "string" || !scope.tenantId.trim()) return "missing_tenant";
  if (typeof scope.purpose !== "string" || !scope.purpose.trim()) return "missing_purpose";
  return null;
}

function scopeMatches(planScope: RetentionScope, record: RetentionRecordRow): boolean {
  const recordScope = parseJsonObject(record.scope_json);
  for (const [key, expected] of objectEntries(planScope)) {
    if (key === "tenantId" || key === "purpose") continue;
    if (String(key).toLowerCase().includes("subject")) continue;
    if (expected === "*") continue;
    const actual =
      key === "recordId"
        ? record.record_id
        : key === "recordType"
          ? record.record_type
          : key === "ontologyType"
            ? record.ontology_type
            : recordScope[key];
    if (Array.isArray(expected)) {
      if (expected.length === 0 || !expected.includes(actual)) return false;
      continue;
    }
    if (expected !== actual) return false;
  }
  return true;
}

function hashesForRecord(record: RetentionRecordRow): Record<string, string[]> {
  const recordScope = parseJsonObject(record.scope_json);
  const hashes: Record<string, string[]> = {};
  for (const [field, aliases] of Object.entries(SUBJECT_FIELD_ALIASES)) {
    const values: unknown[] = [];
    for (const alias of aliases) {
      if (recordScope[alias] !== undefined && recordScope[alias] !== null && recordScope[alias] !== "") values.push(recordScope[alias]);
    }
    if (field === "recordId") values.push(record.record_id);
    if (field === "canonicalId" && typeof recordScope.canonicalMemoryId === "string") values.push(recordScope.canonicalMemoryId);
    hashes[field] = Array.from(new Set(values.map(hashValue)));
  }
  return hashes;
}

function recordMatchesSelectorHashes(record: RetentionRecordRow, selectorHashes: Record<string, string>): boolean {
  const recordHashes = hashesForRecord(record);
  for (const [field, expectedHash] of Object.entries(selectorHashes)) {
    if (!recordHashes[field]?.includes(expectedHash)) return false;
  }
  return true;
}

function identityFingerprint(record: RetentionRecordRow): string {
  const recordHashes = hashesForRecord(record);
  for (const field of EXACT_SUBJECT_FIELDS) {
    const [value] = recordHashes[field] ?? [];
    if (value) return `${field}:${value}`;
  }
  const [name] = recordHashes.name ?? [];
  return `name:${name ?? hashValue(`${record.record_type}:${record.record_id}`)}`;
}

function selectScopedRecords(db: Database.Database, tenantId: string, purpose: string, scope: RetentionScope): RetentionRecordRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM memory_retention_records
       WHERE tenant_id = ? AND purpose = ? AND status IN ('active','policy_unavailable','failed')
       ORDER BY record_type ASC, record_id ASC`
    )
    .all(tenantId, purpose) as RetentionRecordRow[];
  return rows.filter((record) => scopeMatches(scope, record));
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function derivativeInventory(db: Database.Database, record: RetentionRecordRow): SubjectDerivativeInventory[] {
  const recordScope = parseJsonObject(record.scope_json);
  const canonicalHash = record.content_hash ?? sha256Hex(stableJson({ tenantId: record.tenant_id, recordType: record.record_type, recordId: record.record_id }));
  const canonicalId =
    typeof recordScope.canonicalId === "string" && recordScope.canonicalId.trim()
      ? recordScope.canonicalId.trim()
      : typeof recordScope.canonicalMemoryId === "string" && recordScope.canonicalMemoryId.trim()
        ? recordScope.canonicalMemoryId.trim()
        : `canon-${canonicalHash.slice(0, 16)}`;
  const derivatives = new Map<string, SubjectDerivativeInventory>();
  const add = (storeId: string, action: SubjectDerivativeInventory["action"], reason: string, metadata?: Record<string, unknown>) => {
    derivatives.set(storeId, {
      storeId,
      sourceHash: canonicalHash,
      provenance: `retention_record:${record.id}`,
      metadata,
      action,
      reason,
    });
  };

  add(record.record_type, record.record_type === "raw_artifact" ? "tombstone" : "purge", "registered_retention_record", {
    record_id_hash: hashValue(record.record_id),
  });

  if (record.record_type === "message") {
    add("message", "tombstone", "episodic_message_payload_tombstone", { record_id_hash: hashValue(record.record_id) });
    add("fts", "purge", "messages_fts_projection", { record_id_hash: hashValue(record.record_id) });
    add("salience", "purge", "memory_salience_projection", { record_id_hash: hashValue(record.record_id) });
    const embedding = tableExists(db, "message_embeddings")
      ? db.prepare("SELECT message_id FROM message_embeddings WHERE message_id = ?").get(Number(record.record_id))
      : undefined;
    add("embeddings", embedding ? "purge" : "zero_match", embedding ? "local_embedding_projection" : "no_local_embedding", {
      record_id_hash: hashValue(record.record_id),
    });
  }

  if (record.record_type === "agent_memory_candidate") {
    add("candidates", "tombstone", "agent_memory_candidate_projection", { record_id_hash: hashValue(record.record_id) });
  }

  if (tableExists(db, "raw_artifacts")) {
    const artifactRows = db
      .prepare(
        `SELECT id FROM raw_artifacts
         WHERE tenant_id = ? AND (source_id = ? OR id = ? OR session_id = ?)
         ORDER BY created_at ASC, id ASC`
      )
      .all(record.tenant_id, record.record_id, record.record_id, String(recordScope.sessionId ?? "")) as Array<{ id: string }>;
    for (const artifact of artifactRows) {
      add("vault", "tombstone", "raw_vault_projection", { artifact_id_hash: hashValue(artifact.id) });
    }
  }

  if (tableExists(db, "federation_action_derivatives")) {
    const federation = db.prepare(
      `SELECT 1 FROM federation_action_derivatives
       WHERE tenant_id = ? AND canonical_id = ? AND status = 'active' LIMIT 1`
    ).get(record.tenant_id, canonicalId);
    if (federation) add("federation", "tombstone", "federation_action_proof_derivative");
  }

  for (const storeId of KNOWN_STORES) {
    if (!derivatives.has(storeId)) add(storeId, "zero_match", "not_linked");
  }

  return Array.from(derivatives.values()).sort((a, b) => a.storeId.localeCompare(b.storeId));
}

function canonicalTargetForRecord(db: Database.Database, record: RetentionRecordRow, now: Date): SubjectRecordTarget {
  const recordScope = parseJsonObject(record.scope_json);
  const canonicalHash = record.content_hash ?? sha256Hex(stableJson({ tenantId: record.tenant_id, recordType: record.record_type, recordId: record.record_id }));
  const canonicalId =
    typeof recordScope.canonicalId === "string" && recordScope.canonicalId.trim()
      ? recordScope.canonicalId.trim()
      : typeof recordScope.canonicalMemoryId === "string" && recordScope.canonicalMemoryId.trim()
        ? recordScope.canonicalMemoryId.trim()
        : `canon-${canonicalHash.slice(0, 16)}`;
  const derivatives = derivativeInventory(db, record);
  const holds = activeLegalHoldsForRecord(db, record, now);
  return {
    canonicalId,
    canonicalHash,
    recordType: record.record_type,
    recordId: record.record_id,
    recordIdHash: hashValue(record.record_id),
    ontologyType: record.ontology_type,
    tier: record.record_type === "message" ? "episodic" : record.record_type,
    linkReasons: ["subject_selector_match", `ontology:${record.ontology_type}`, `retention_record:${record.id}`],
    derivatives,
    held: holds.length > 0,
    holdIds: holds.map((hold) => hold.id),
    policy: {
      policyId: record.policy_id,
      policyVersion: record.policy_version,
      retentionDeadline: record.retention_deadline,
      retentionStatus: record.status,
    },
  };
}

function sourceVersionHash(records: RetentionRecordRow[], holds: Array<{ holdId: string; recordType: string; recordId: string }>): string {
  return sha256Hex(
    stableJson({
      records: records.map((record) => ({
        id: record.id,
        tenant_id: record.tenant_id,
        record_type: record.record_type,
        record_id: record.record_id,
        ontology_type: record.ontology_type,
        scope_hash: sha256Hex(record.scope_json),
        policy_id: record.policy_id,
        policy_version: record.policy_version,
        status: record.status,
        content_hash: record.content_hash,
        updated_at: record.updated_at,
      })),
      holds: holds.map((hold) => ({ hold_id: hold.holdId, record_type: hold.recordType, record_id: hold.recordId })),
    })
  );
}

function computePlanHash(evidence: Omit<SubjectPlanEvidence, "planHash" | "createdAt">): string {
  return sha256Hex(
    stableJson({
      tenantId: evidence.tenantId,
      subjectHash: evidence.subjectHash,
      selectorHashes: evidence.selectorHashes,
      scopeHash: evidence.scopeHash,
      status: evidence.status,
      reason: evidence.reason,
      matchedRecords: evidence.matchedRecords,
      excludedRecords: evidence.excludedRecords,
      candidates: evidence.candidates,
      holds: evidence.holds,
      coverage: evidence.coverage,
      policy: evidence.policy,
      estimatedEffects: evidence.estimatedEffects,
      sourceVersionHash: evidence.sourceVersionHash,
    })
  );
}

function buildEvidenceFromHashes(
  db: Database.Database,
  input: { tenantId: string; scope: RetentionScope; selectorHashes: Record<string, string>; now?: Date }
): SubjectPlanEvidence {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const scope = input.scope;
  const subjectHash = sha256Hex(stableJson(input.selectorHashes));
  const scopedRows = selectScopedRecords(db, input.tenantId, ensureNonEmpty(String(scope.purpose ?? ""), "scope.purpose"), scope);
  const matchedRows = scopedRows.filter((record) => recordMatchesSelectorHashes(record, input.selectorHashes));
  const identities = new Map<string, RetentionRecordRow[]>();
  for (const record of matchedRows) {
    const fingerprint = identityFingerprint(record);
    identities.set(fingerprint, [...(identities.get(fingerprint) ?? []), record]);
  }
  const candidates = Array.from(identities.entries()).map(([fingerprint, records]) => ({
    candidateHash: sha256Hex(fingerprint),
    recordCount: records.length,
    canonicalIds: records.map((record) => canonicalTargetForRecord(db, record, now).canonicalId).sort(),
  }));

  if (matchedRows.length === 0) {
    const denied: Omit<SubjectPlanEvidence, "planHash" | "createdAt"> = {
      tenantId: input.tenantId,
      subjectHash,
      selectorHashes: input.selectorHashes,
      scope,
      scopeHash: scopeHash(scope),
      status: "denied",
      reason: "subject_not_found",
      matchedRecords: [],
      excludedRecords: scopedRows.map((record) => ({ recordType: record.record_type, recordIdHash: hashValue(record.record_id), reason: "subject_selector_mismatch" })),
      candidates: [],
      holds: [],
      coverage: [],
      policy: { requiredReview: true, executionRequiresCurrentHash: true, rawPayloadExcluded: true },
      estimatedEffects: { targetCount: 0, heldCount: 0, purgeCount: 0, tombstoneCount: 0, zeroMatchCount: 0 },
      sourceVersionHash: sourceVersionHash([], []),
    };
    return { ...denied, planHash: computePlanHash(denied), createdAt };
  }

  if (identities.size > 1) {
    const ambiguous: Omit<SubjectPlanEvidence, "planHash" | "createdAt"> = {
      tenantId: input.tenantId,
      subjectHash,
      selectorHashes: input.selectorHashes,
      scope,
      scopeHash: scopeHash(scope),
      status: "ambiguous",
      reason: "ambiguous_subject_selector",
      matchedRecords: [],
      excludedRecords: [],
      candidates,
      holds: [],
      coverage: [],
      policy: { requiredReview: true, executionRequiresCurrentHash: true, rawPayloadExcluded: true },
      estimatedEffects: { targetCount: 0, heldCount: 0, purgeCount: 0, tombstoneCount: 0, zeroMatchCount: 0 },
      sourceVersionHash: sourceVersionHash([], []),
    };
    return { ...ambiguous, planHash: computePlanHash(ambiguous), createdAt };
  }

  const matchedRecords = matchedRows.map((record) => canonicalTargetForRecord(db, record, now));
  const holds = matchedRecords.flatMap((target) =>
    target.holdIds.map((holdId) => {
      const hold = db.prepare("SELECT reason_code FROM memory_legal_holds WHERE id = ?").get(holdId) as Pick<LegalHoldRow, "reason_code"> | undefined;
      return {
        holdId,
        recordType: target.recordType,
        recordId: target.recordId,
        reasonCodeHash: hashValue(hold?.reason_code ?? "unknown"),
      };
    })
  );
  const coverage = matchedRecords.flatMap((target) =>
    target.derivatives.map((derivative) => ({ canonicalId: target.canonicalId, storeId: derivative.storeId, action: derivative.action, reason: derivative.reason }))
  );
  const estimatedEffects = {
    targetCount: matchedRecords.length,
    heldCount: matchedRecords.filter((record) => record.held).length,
    purgeCount: coverage.filter((item) => item.action === "purge").length,
    tombstoneCount: coverage.filter((item) => item.action === "tombstone").length,
    zeroMatchCount: coverage.filter((item) => item.action === "zero_match").length,
  };
  const evidence: Omit<SubjectPlanEvidence, "planHash" | "createdAt"> = {
    tenantId: input.tenantId,
    subjectHash,
    selectorHashes: input.selectorHashes,
    scope,
    scopeHash: scopeHash(scope),
    status: "planned",
    reason: "subject_resolved",
    matchedRecords,
    excludedRecords: scopedRows
      .filter((record) => !matchedRows.some((matched) => matched.id === record.id))
      .map((record) => ({ recordType: record.record_type, recordIdHash: hashValue(record.record_id), reason: "subject_selector_mismatch" })),
    candidates,
    holds,
    coverage,
    policy: { requiredReview: true, executionRequiresCurrentHash: true, rawPayloadExcluded: true },
    estimatedEffects,
    sourceVersionHash: sourceVersionHash(matchedRows, holds),
  };
  return { ...evidence, planHash: computePlanHash(evidence), createdAt };
}

function loadPlanRow(db: Database.Database, tenantId: string, planId: string): SubjectErasurePlanRow {
  const row = db.prepare("SELECT * FROM memory_subject_erasure_plans WHERE tenant_id = ? AND id = ?").get(tenantId, planId) as SubjectErasurePlanRow | undefined;
  if (!row) throw new Error("subject erasure plan not found");
  return row;
}

function assertCurrentPlan(db: Database.Database, row: SubjectErasurePlanRow, now: Date): SubjectPlanEvidence {
  const recomputed = buildEvidenceFromHashes(db, {
    tenantId: row.tenant_id,
    scope: JSON.parse(row.scope_json || "{}") as RetentionScope,
    selectorHashes: JSON.parse(row.selector_hashes_json || "{}") as Record<string, string>,
    now,
  });
  if (recomputed.status !== "planned") throw new Error(`subject erasure plan is no longer executable: ${recomputed.reason}`);
  if (recomputed.sourceVersionHash !== row.source_version_hash || recomputed.planHash !== row.plan_hash) {
    throw new Error("subject erasure plan is stale: source version or coverage changed");
  }
  return recomputed;
}

export function createSubjectErasurePlan(
  db: Database.Database,
  input: { id?: string; tenantId?: string; subject: SubjectSelector; scope: RetentionScope; actorId: string; now?: Date }
): SubjectPlanResult {
  const tenantId = input.tenantId ?? (typeof input.scope?.tenantId === "string" ? input.scope.tenantId : "default-tenant");
  const now = input.now ?? new Date();
  const actorId = ensureNonEmpty(input.actorId, "actorId");
  const scopeError = hasCompleteScope(input.scope);
  const selectorHashes = hashSelectorFields(input.subject ?? {});
  if (scopeError || Object.keys(selectorHashes).length === 0) {
    const reason = scopeError ?? "missing_subject_identity";
    return { ok: false, status: "denied", reason, plan: null, candidates: [] };
  }

  const evidence = buildEvidenceFromHashes(db, { tenantId, scope: input.scope, selectorHashes, now });
  if (evidence.status !== "planned") {
    return { ok: false, status: evidence.status, reason: evidence.reason, plan: null, candidates: evidence.candidates };
  }

  const id = input.id ?? `suberase_${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO memory_subject_erasure_plans
      (id, tenant_id, subject_hash, selector_hashes_json, status, scope_json, scope_hash,
       matched_records_json, excluded_records_json, coverage_json, holds_json, policy_json,
       estimated_effects_json, plan_hash, source_version_hash, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tenantId,
    evidence.subjectHash,
    stableJson(selectorHashes),
    stableJson(input.scope),
    evidence.scopeHash,
    stableJson(evidence.matchedRecords),
    stableJson(evidence.excludedRecords),
    stableJson(evidence.coverage),
    stableJson(evidence.holds),
    stableJson(evidence.policy),
    stableJson(evidence.estimatedEffects),
    evidence.planHash,
    evidence.sourceVersionHash,
    actorId,
    evidence.createdAt,
    evidence.createdAt
  );

  writeAuditEntry(
    {
      tenant_id: tenantId,
      actor_id: actorId,
      actor_role: "operator",
      event_type: AUDIT_EVENT_TYPES.MEMORY_SUBJECT_ERASURE_PLANNED,
      entity_type: ENTITY_TYPES.MEMORY_SUBJECT_ERASURE,
      entity_id: `subject_erasure_plan:${id}`,
      reason: "subject_erasure_plan_created",
      metadata_json: {
        plan_id: id,
        subject_hash: evidence.subjectHash,
        scope_hash: evidence.scopeHash,
        plan_hash: evidence.planHash,
        source_version_hash: evidence.sourceVersionHash,
        target_count: evidence.estimatedEffects.targetCount,
        held_count: evidence.estimatedEffects.heldCount,
      },
      created_at: evidence.createdAt,
    },
    db
  );

  return { ok: true, status: "planned", reason: evidence.reason, plan: { id, ...evidence }, candidates: evidence.candidates };
}

export function approveSubjectErasurePlan(
  db: Database.Database,
  input: { tenantId?: string; planId: string; planHash: string; actorId: string; now?: Date }
): SubjectErasurePlanRow {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const row = loadPlanRow(db, tenantId, input.planId);
  if (row.status !== "planned") throw new Error(`subject erasure plan cannot be approved from status ${row.status}`);
  if (row.plan_hash !== input.planHash) throw new Error("subject erasure plan hash mismatch");
  assertCurrentPlan(db, row, new Date(now));

  db.prepare(
    `UPDATE memory_subject_erasure_plans
     SET status = 'approved', reviewed_by = ?, reviewed_at = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ? AND status = 'planned'`
  ).run(input.actorId, now, now, tenantId, input.planId);

  writeAuditEntry(
    {
      tenant_id: tenantId,
      actor_id: input.actorId,
      actor_role: "operator",
      event_type: AUDIT_EVENT_TYPES.MEMORY_SUBJECT_ERASURE_APPROVED,
      entity_type: ENTITY_TYPES.MEMORY_SUBJECT_ERASURE,
      entity_id: `subject_erasure_plan:${input.planId}`,
      reason: "subject_erasure_plan_approved",
      metadata_json: { plan_id: input.planId, plan_hash: input.planHash, scope_hash: row.scope_hash, subject_hash: row.subject_hash },
      created_at: now,
    },
    db
  );

  return loadPlanRow(db, tenantId, input.planId);
}

function identityForTarget(target: SubjectRecordTarget): CanonicalMemoryIdentity {
  return {
    id: target.canonicalId,
    canonicalHash: target.canonicalHash,
    derivatives: target.derivatives
      .filter((derivative) => derivative.action !== "zero_match")
      .map((derivative) => ({
        storeId: derivative.storeId,
        sourceHash: derivative.sourceHash,
        provenance: derivative.provenance,
        metadata: derivative.metadata,
      })),
  };
}

function erasePayloadForTarget(db: Database.Database, tenantId: string, target: SubjectRecordTarget, planId: string, erasedAt: string): void {
  if (target.recordType === "message") {
    const messageId = Number(target.recordId);
    if (Number.isInteger(messageId)) {
      db.prepare(
        `UPDATE messages
         SET content = '[erased]', visibility = 'private', domain = NULL, sensitivity = NULL, policy = 'sealed'
         WHERE id = ?`
      ).run(messageId);
      db.prepare("DELETE FROM memory_salience WHERE message_id = ?").run(messageId);
      if (tableExists(db, "message_embeddings")) db.prepare("DELETE FROM message_embeddings WHERE message_id = ?").run(messageId);
    }
  }

  if (target.recordType === "agent_memory_candidate" && tableExists(db, "agent_memory_candidates")) {
    db.prepare(
      `UPDATE agent_memory_candidates
       SET content = '[erased]', status = 'rejected', metadata_json = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(stableJson({ erased: true, plan_id: planId, erased_at: erasedAt }), tenantId, target.recordId);
  }

  db.prepare(
    `INSERT OR IGNORE INTO memory_erasure_tombstones
      (id, tenant_id, subject_plan_id, canonical_id, record_type, record_id, derivative_inventory_json,
       policy_json, outcome, erasure_id, scope_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'erased', ?, ?, ?)`
  ).run(
    `tomb_${sha256Hex(stableJson({ planId, canonicalId: target.canonicalId, recordType: target.recordType, recordId: target.recordId })).slice(0, 32)}`,
    tenantId,
    planId,
    target.canonicalId,
    target.recordType,
    target.recordId,
    stableJson(target.derivatives),
    stableJson(target.policy),
    `${planId}:${target.canonicalId}`,
    scopeHash({ tenantId, planId }),
    erasedAt
  );
}

export async function executeSubjectErasurePlan(
  db: Database.Database,
  input: { tenantId?: string; planId: string; planHash: string; actorId: string; now?: Date }
): Promise<SubjectExecutionResult> {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const row = loadPlanRow(db, tenantId, input.planId);
  if (row.status !== "approved") throw new Error(`subject erasure plan cannot execute from status ${row.status}`);
  if (row.plan_hash !== input.planHash) throw new Error("subject erasure plan hash mismatch");
  const current = assertCurrentPlan(db, row, new Date(now));

  db.prepare("UPDATE memory_subject_erasure_plans SET status = 'executing', updated_at = ? WHERE tenant_id = ? AND id = ?").run(now, tenantId, input.planId);

  const storeOutcomes: SubjectExecutionResult["storeOutcomes"] = [];
  const heldBlockers = current.matchedRecords.filter((target) => target.held);
  let erased = 0;
  let failed = 0;

  for (const target of current.matchedRecords.filter((candidate) => !candidate.held)) {
    try {
      const report: ErasureReport = await coordinateErasure(db, identityForTarget(target), {
        tenantId,
        actorId: input.actorId,
        scope: current.scope,
        idempotencyKey: `${input.planId}:${target.canonicalId}`,
        now: new Date(now),
      });
      storeOutcomes.push({ canonicalId: target.canonicalId, outcomes: report.storeOutcomes });
      if (report.status === "failed") failed += 1;
      erasePayloadForTarget(db, tenantId, target, input.planId, now);
      revokeOntologyDerivativesForErasedRecord(db, {
        tenantId,
        recordType: target.recordType,
        recordId: target.recordId,
        actor: input.actorId,
      });
      erased += 1;
    } catch (err) {
      failed += 1;
      storeOutcomes.push({
        canonicalId: target.canonicalId,
        outcomes: [{ storeId: "coordinator", status: "failed", reason: err instanceof Error ? err.message : String(err) }],
      });
    }
  }

  const hasIncompleteStore = storeOutcomes.some((item) => item.outcomes.some((outcome) => outcome.status === "failed" || outcome.status === "unavailable" || outcome.status === "pending"));
  const status: SubjectExecutionResult["status"] =
    failed > 0
      ? "failed"
      : heldBlockers.length === current.matchedRecords.length
        ? "blocked"
        : heldBlockers.length > 0 || hasIncompleteStore
          ? "incomplete"
          : "completed";
  const result: SubjectExecutionResult = {
    ok: status === "completed",
    planId: input.planId,
    status,
    erased,
    blocked: heldBlockers.length,
    failed,
    storeOutcomes,
    heldBlockers,
    planHash: input.planHash,
  };

  // Wrap the final commit trio (UPDATE plan status, write result, audit) in
  // db.transaction so a partial commit cannot leave the plan row out of sync
  // with its result_json or audit chain. Individual target erasures ran in
  // their own coordinator transactions; this transaction covers only the
  // subject-level commit so it remains a single atomic unit.
  db.transaction(() => {
    db.prepare(
      `UPDATE memory_subject_erasure_plans
       SET status = ?, executed_by = ?, executed_at = ?, result_json = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(status, input.actorId, now, stableJson(result), now, tenantId, input.planId);

    writeAuditEntry(
      {
        tenant_id: tenantId,
        actor_id: input.actorId,
        actor_role: "operator",
        event_type: AUDIT_EVENT_TYPES.MEMORY_SUBJECT_ERASURE_EXECUTED,
        entity_type: ENTITY_TYPES.MEMORY_SUBJECT_ERASURE,
        entity_id: `subject_erasure_plan:${input.planId}`,
        reason: status === "completed" ? "subject_erasure_completed" : `subject_erasure_${status}`,
        metadata_json: {
          plan_id: input.planId,
          plan_hash: input.planHash,
          scope_hash: row.scope_hash,
          subject_hash: row.subject_hash,
          erased,
          blocked: heldBlockers.length,
          failed,
          status,
          held_record_ids: heldBlockers.map((target) => target.recordId),
        },
        created_at: now,
      },
      db
    );
  })();

  return result;
}

export function listSubjectErasurePlans(db: Database.Database, input: { tenantId?: string; limit?: number }): Array<SubjectErasurePlanRow & { result: Record<string, unknown> | null }> {
  const tenantId = input.tenantId ?? "default-tenant";
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = db
    .prepare("SELECT * FROM memory_subject_erasure_plans WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(tenantId, limit) as SubjectErasurePlanRow[];
  return rows.map((row) => ({ ...row, result: row.result_json ? (JSON.parse(row.result_json) as Record<string, unknown>) : null }));
}
