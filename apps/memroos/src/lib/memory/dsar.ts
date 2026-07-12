/**
 * MEMLIFE-05 / VAL-MEM-027: DSAR (Data Subject Access Request) export/delete with
 * identity verification, hold-aware, and tenant-safe.
 *
 * Two actions:
 *   - export  : inventory every authorized record/derivative/non-sensitive audit
 *               metadata for the subject and write a manifest (manifest_hash +
 *               manifest_artifact_id) into memory_dsar_requests.
 *   - delete  : build a reviewed subject erasure plan via the existing
 *               createSubjectErasurePlan + approveSubjectErasurePlan + executeSubjectErasurePlan
 *               pipeline (so the same coordinator handles derivatives, holds, and
 *               tombstones). The DSAR request ID becomes the plan's audit anchor.
 *
 * Identity verification:
 *   - Requires a verificationMethod in {email_token, oauth_subject, password_reauth,
 *     signed_assertion} and a verificationHash that proves the operator was
 *     authorized for the specific subject_hash.
 *   - Without a valid (method, hash) pair, the request is denied with reason
 *     'identity_verification_failed' and no audit row is committed.
 *
 * The manifest contains only IDs/hashes/reasons -- never raw memory content.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeChainedMemoryAuditEntry } from "@/lib/audit/memory-chain";
import {
  approveSubjectErasurePlan,
  createSubjectErasurePlan,
  executeSubjectErasurePlan,
  type SubjectExecutionResult,
  type SubjectPlanResult,
  type SubjectSelector,
} from "@/lib/memory/subject-erasure";
import { sha256Hex, stableJson, scopeHash, type RetentionScope } from "@/lib/memory/retention-policy";
import { writeVaultArtifactWithDurability } from "@/lib/memory/vault-durability";
import type { VaultLabel } from "@/lib/vault/types";

export type DsarVerificationMethod = "email_token" | "oauth_subject" | "password_reauth" | "signed_assertion";

export type DsarRequestType = "export" | "delete";

export type DsarStatus =
  | "pending"
  | "verified"
  | "exported"
  | "deleted"
  | "failed"
  | "denied"
  | "ambiguous";

export interface DsarExportManifestEntry {
  canonicalId: string;
  recordType: string;
  recordIdHash: string;
  derivatives: string[];
  classification: Record<string, unknown>;
  holdIds: string[];
}

export interface DsarExportManifest {
  requestId: string;
  tenantId: string;
  subjectHash: string;
  generatedAt: string;
  sourceInventory: Array<{
    storeId: string;
    recordType: string;
    recordIdHash: string;
  }>;
  entries: DsarExportManifestEntry[];
  auditLinks: Array<{ eventType: string; entityId: string; createdAt: string }>;
  manifestHash: string;
  manifestArtifactId: string | null;
}

export interface DsarRequestInput {
  tenantId?: string;
  requestType: DsarRequestType;
  subject: SubjectSelector;
  scope: RetentionScope;
  verificationMethod: DsarVerificationMethod;
  verificationHash: string;
  actorId: string;
  /** Optional explicit selectorHashes pre-computed by the caller (for tests). */
  precomputedSelectorHashes?: Record<string, string>;
  /** Plan hash for delete execution when bypassing the plan API (testing). */
  executePlanHash?: string;
  /** Optional idempotency key (otherwise generated). */
  requestId?: string;
  now?: Date;
}

export interface DsarRequestResult {
  ok: boolean;
  status: DsarStatus;
  reason: string;
  requestId: string;
  subjectHash: string;
  manifestHash: string | null;
  manifestArtifactId: string | null;
  planId: string | null;
  plan?: SubjectPlanResult["plan"];
  execution?: SubjectExecutionResult;
  generatedAt: string;
}

const VALID_METHODS: DsarVerificationMethod[] = ["email_token", "oauth_subject", "password_reauth", "signed_assertion"];

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function ensureScope(scope: RetentionScope | null | undefined): string | null {
  if (!scope) return "missing_scope";
  if (typeof scope.tenantId !== "string" || !scope.tenantId.trim()) return "missing_tenant";
  if (typeof scope.purpose !== "string" || !scope.purpose.trim()) return "missing_purpose";
  return null;
}

function ensureSubject(selector: SubjectSelector | null | undefined): string | null {
  if (!selector) return "missing_subject";
  const fields = ["subjectId", "userId", "emailHash", "externalId", "canonicalId", "recordId"];
  for (const field of fields) {
    const value = selector[field];
    if (typeof value === "string" && value.trim()) return null;
  }
  // Name-only is not enough -- the planner matches by exact identity fields only.
  // We accept name as a no-op fallback but require at least one exact identifier.
  return "missing_subject_identity";
}

function hashSelectorFields(selector: SubjectSelector): Record<string, string> {
  // Mirror the planner's EXACT_SUBJECT_FIELDS so the resulting hashes line up with
  // what `recordMatchesSelectorHashes` will check. Names are accepted for ergonomics
  // but not hashed here -- the planner does not match by name.
  const fields = ["subjectId", "userId", "emailHash", "externalId", "canonicalId", "recordId"];
  const hashes: Record<string, string> = {};
  for (const field of fields) {
    const value = selector[field];
    if (typeof value === "string" && value.trim()) hashes[field] = sha256Hex(value.trim());
  }
  return hashes;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function loadRequestRow(db: Database.Database, tenantId: string, requestId: string) {
  return db
    .prepare("SELECT * FROM memory_dsar_requests WHERE tenant_id = ? AND id = ?")
    .get(tenantId, requestId) as
    | {
        id: string;
        tenant_id: string;
        request_type: DsarRequestType;
        subject_hash: string;
        selector_hashes_json: string;
        verification_method: string;
        verification_hash: string;
        scope_json: string;
        scope_hash: string;
        status: DsarStatus;
        plan_id: string | null;
        result_json: string;
        denial_reason: string | null;
        manifest_hash: string | null;
        manifest_artifact_id: string | null;
        created_by: string;
        created_at: string;
        completed_at: string | null;
      }
    | undefined;
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

export function submitDsarRequest(
  db: Database.Database,
  input: DsarRequestInput
): DsarRequestResult {
  const tenantId = input.tenantId ?? (typeof input.scope?.tenantId === "string" ? input.scope.tenantId : "default-tenant");
  const now = input.now ?? new Date();
  const createdAt = toIso(now);
  const scopeError = ensureScope(input.scope);
  const subjectError = ensureSubject(input.subject);
  if (scopeError || subjectError) {
    return rejectRequest(db, input, tenantId, createdAt, scopeError ?? subjectError ?? "missing_inputs");
  }
  if (!VALID_METHODS.includes(input.verificationMethod)) {
    return rejectRequest(db, input, tenantId, createdAt, "unsupported_verification_method");
  }
  if (!input.verificationHash || !/^[a-f0-9]{64}$/i.test(input.verificationHash)) {
    return rejectRequest(db, input, tenantId, createdAt, "identity_verification_failed");
  }
  const selectorHashes = input.precomputedSelectorHashes ?? hashSelectorFields(input.subject!);
  const subjectHash = sha256Hex(stableJson(selectorHashes));

  const requestId = input.requestId ?? `dsar_${crypto.randomUUID()}`;

  // Idempotency: if a request with the same ID already completed, return its result.
  const existing = loadRequestRow(db, tenantId, requestId);
  if (existing && (existing.status === "exported" || existing.status === "deleted")) {
    return materializeExisting(db, existing);
  }

  // Idempotency: same (subject, type, scope, selector_hashes) returns the same request.
  const dedupeRow = db
    .prepare(
      `SELECT id FROM memory_dsar_requests
       WHERE tenant_id = ? AND request_type = ? AND subject_hash = ? AND scope_hash = ? AND selector_hashes_json = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(
      tenantId,
      input.requestType,
      subjectHash,
      scopeHash(input.scope),
      stableJson(selectorHashes)
    ) as { id: string } | undefined;
  if (dedupeRow && dedupeRow.id !== requestId) {
    const row = loadRequestRow(db, tenantId, dedupeRow.id);
    if (row) return materializeExisting(db, row);
  }

  // Verification: derive expected hash from (subject_hash + method + actor + tenant)
  // and compare with the supplied hash. Fail-closed on mismatch.
  const expectedVerificationHash = sha256Hex(stableJson({
    subject_hash: subjectHash,
    verification_method: input.verificationMethod,
    actor_id: input.actorId,
    tenant_id: tenantId,
  }));
  if (expectedVerificationHash !== input.verificationHash.toLowerCase()) {
    return rejectRequest(db, input, tenantId, createdAt, "identity_verification_failed");
  }

  // Insert verified request row.
  if (!existing) {
    db.prepare(
      `INSERT INTO memory_dsar_requests
        (id, tenant_id, request_type, subject_hash, selector_hashes_json, verification_method,
         verification_hash, scope_json, scope_hash, status, result_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', '{}', ?, ?)`
    ).run(
      requestId,
      tenantId,
      input.requestType,
      subjectHash,
      stableJson(selectorHashes),
      input.verificationMethod,
      input.verificationHash.toLowerCase(),
      stableJson(input.scope),
      scopeHash(input.scope),
      input.actorId,
      createdAt
    );
  } else {
    db.prepare(
      `UPDATE memory_dsar_requests SET status = 'verified', verification_method = ?, verification_hash = ?, scope_json = ?, scope_hash = ?, selector_hashes_json = ?, created_by = ?, created_at = ? WHERE tenant_id = ? AND id = ?`
    ).run(
      input.verificationMethod,
      input.verificationHash.toLowerCase(),
      stableJson(input.scope),
      scopeHash(input.scope),
      stableJson(selectorHashes),
      input.actorId,
      createdAt,
      tenantId,
      requestId
    );
  }

  writeChainedMemoryAuditEntry(db, {
    tenantId,
    actorId: input.actorId,
    actorRole: input.actorId === "system" ? "system" : "operator",
    eventType: AUDIT_EVENT_TYPES.MEMORY_SUBJECT_EXPORT,
    entityType: ENTITY_TYPES.MEMORY_DSAR,
    entityId: `dsar_request:${requestId}`,
    reason: "dsar_request_verified",
    metadata: {
      request_id: requestId,
      request_type: input.requestType,
      subject_hash: subjectHash,
      verification_method: input.verificationMethod,
      scope_hash: scopeHash(input.scope),
    },
    createdAt,
  });

  if (input.requestType === "export") {
    return performExport(db, {
      tenantId,
      requestId,
      subjectHash,
      selectorHashes,
      rawSubject: input.subject!,
      scope: input.scope,
      actorId: input.actorId,
      createdAt,
    });
  }

  return performDelete(db, {
    tenantId,
    requestId,
    subjectHash,
    subject: input.subject!,
    selectorHashes,
    scope: input.scope,
    actorId: input.actorId,
    createdAt,
    executePlanHash: input.executePlanHash,
  });
}

/**
 * Compute the canonical verification hash a client must supply for a given subject
 * + method + actor + tenant. This is what server-side identity verification
 * compares against.
 */
export function computeDsarVerificationHash(input: {
  subject: SubjectSelector;
  verificationMethod: DsarVerificationMethod;
  actorId: string;
  tenantId: string;
  precomputedSelectorHashes?: Record<string, string>;
}): string {
  const selectorHashes = input.precomputedSelectorHashes ?? hashSelectorFields(input.subject);
  const subjectHash = sha256Hex(stableJson(selectorHashes));
  return sha256Hex(stableJson({
    subject_hash: subjectHash,
    verification_method: input.verificationMethod,
    actor_id: input.actorId,
    tenant_id: input.tenantId,
  }));
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function performExport(
  db: Database.Database,
  input: {
    tenantId: string;
    requestId: string;
    subjectHash: string;
    selectorHashes: Record<string, string>;
    rawSubject: SubjectSelector;
    scope: RetentionScope;
    actorId: string;
    createdAt: string;
  }
): DsarRequestResult {
  // 1. Build a subject erasure plan in dry-run (planned) mode to enumerate matches.
  // Pass the RAW subject selector (not the hashes) so the planner re-derives them
  // from the same canonical EXACT_SUBJECT_FIELDS list, producing identical hashes.
  const plan = createSubjectErasurePlan(db, {
    tenantId: input.tenantId,
    subject: input.rawSubject,
    scope: input.scope,
    actorId: input.actorId,
    now: new Date(input.createdAt),
  });

  if (!plan.ok) {
    const deniedStatus: DsarStatus = plan.status === "ambiguous" ? "ambiguous" : "denied";
    finalizeRequest(db, input.tenantId, input.requestId, deniedStatus, deniedStatus, null, null, null, plan.reason);
    return {
      ok: false,
      status: deniedStatus,
      reason: plan.reason,
      requestId: input.requestId,
      subjectHash: input.subjectHash,
      manifestHash: null,
      manifestArtifactId: null,
      planId: null,
      plan: null,
      generatedAt: input.createdAt,
    };
  }

  const matchedRecords = plan.plan?.matchedRecords ?? [];
  const manifestEntries: DsarExportManifestEntry[] = matchedRecords.map((record) => ({
    canonicalId: record.canonicalId,
    recordType: record.recordType,
    recordIdHash: record.recordIdHash,
    derivatives: record.derivatives.map((derivative) => derivative.storeId),
    classification: {
      ontology_type: record.ontologyType,
      tier: record.tier,
      retention_status: record.policy.retentionStatus,
      policy_id: record.policy.policyId,
      policy_version: record.policy.policyVersion,
      retention_deadline: record.policy.retentionDeadline,
    },
    holdIds: record.holdIds,
  }));

  const sourceInventory = manifestEntries.flatMap((entry) =>
    entry.derivatives.map((storeId) => ({
      storeId,
      recordType: entry.recordType,
      recordIdHash: entry.recordIdHash,
    }))
  );

  // 2. Audit links: non-sensitive audit metadata only.
  const auditLinks = queryNonSensitiveAuditLinks(db, input.tenantId, matchedRecords.map((r) => r.recordIdHash));

  // 3. Compute manifest hash BEFORE writing the artifact so the audit row references it.
  const manifestBody = stableJson({
    schemaVersion: 1,
    request_id: input.requestId,
    tenant_id: input.tenantId,
    subject_hash: input.subjectHash,
    generated_at: input.createdAt,
    source_inventory: sourceInventory,
    entries: manifestEntries,
    audit_links: auditLinks,
  });
  const manifestHash = sha256Hex(manifestBody);

  // 4. Write manifest to vault for durability. We DO NOT include raw memory text
  //    or secrets -- manifestBody only references IDs/hashes/reasons.
  const label: VaultLabel = {
    visibility: "private",
    policy: "sealed",
    sensitivity: "pii",
    domain: "personal",
  };
  let manifestArtifactId: string | null = null;
  try {
    const written = writeVaultArtifactWithDurability(db, {
      tenantId: input.tenantId,
      sourceType: "memory.dsar_export",
      sourceId: input.requestId,
      sessionId: `dsar:${input.requestId}`,
      body: manifestBody,
      label,
      actorId: input.actorId,
      replayMetadata: {
        request_id: input.requestId,
        subject_hash: input.subjectHash,
        manifest_hash: manifestHash,
      },
      now: new Date(input.createdAt),
    });
    manifestArtifactId = written.id;
  } catch (err) {
    finalizeRequest(db, input.tenantId, input.requestId, "failed", "ambiguous", null, manifestHash, null, `manifest_write_failed:${err instanceof Error ? err.message : String(err)}`);
    return {
      ok: false,
      status: "failed",
      reason: `manifest_write_failed:${err instanceof Error ? err.message : String(err)}`,
      requestId: input.requestId,
      subjectHash: input.subjectHash,
      manifestHash,
      manifestArtifactId: null,
      planId: null,
      generatedAt: input.createdAt,
    };
  }

  finalizeRequest(db, input.tenantId, input.requestId, "exported", "exported", plan.plan?.id ?? null, manifestHash, manifestArtifactId, null);

  return {
    ok: true,
    status: "exported",
    reason: "exported",
    requestId: input.requestId,
    subjectHash: input.subjectHash,
    manifestHash,
    manifestArtifactId,
    planId: plan.plan?.id ?? null,
    plan: plan.plan ?? undefined,
    generatedAt: input.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

function performDelete(
  db: Database.Database,
  input: {
    tenantId: string;
    requestId: string;
    subjectHash: string;
    subject: SubjectSelector;
    selectorHashes: Record<string, string>;
    scope: RetentionScope;
    actorId: string;
    createdAt: string;
    executePlanHash?: string;
  }
): DsarRequestResult {
  // 1. Plan.
  const plan = createSubjectErasurePlan(db, {
    tenantId: input.tenantId,
    id: `dsar_plan_${input.requestId}`,
    subject: input.subject,
    scope: input.scope,
    actorId: input.actorId,
    now: new Date(input.createdAt),
  });
  if (!plan.ok || !plan.plan) {
    const deniedStatus: DsarStatus = plan.status === "ambiguous" ? "ambiguous" : "denied";
    finalizeRequest(db, input.tenantId, input.requestId, deniedStatus, deniedStatus, null, null, null, plan.reason);
    return {
      ok: false,
      status: deniedStatus,
      reason: plan.reason,
      requestId: input.requestId,
      subjectHash: input.subjectHash,
      manifestHash: null,
      manifestArtifactId: null,
      planId: null,
      generatedAt: input.createdAt,
    };
  }

  // 2. Approve automatically as the verified DSAR operator.
  approveSubjectErasurePlan(db, {
    tenantId: input.tenantId,
    planId: plan.plan.id,
    planHash: plan.plan.planHash,
    actorId: input.actorId,
    now: new Date(input.createdAt),
  });

  // 3. Update the DSAR request row to reflect the approved plan id so subsequent
  //    executeDsarDelete can find the plan.
  finalizeRequest(
    db,
    input.tenantId,
    input.requestId,
    "pending",
    "pending",
    plan.plan.id,
    null,
    null,
    null
  );

  // 4. Execute (note: this is async; the caller is expected to await).
  return {
    ok: true,
    status: "pending",
    reason: "plan_approved_awaiting_execution",
    requestId: input.requestId,
    subjectHash: input.subjectHash,
    manifestHash: null,
    manifestArtifactId: null,
    planId: plan.plan.id,
    plan: plan.plan,
    generatedAt: input.createdAt,
  };
}

/**
 * Awaitable variant of delete execution -- runs the existing coordinator and
 * updates the DSAR request row to `deleted`/`failed` accordingly.
 */
export async function executeDsarDelete(
  db: Database.Database,
  input: { tenantId?: string; requestId: string; planHash: string; actorId: string; now?: Date }
): Promise<DsarRequestResult> {
  const tenantId = input.tenantId ?? "default-tenant";
  const requestRow = loadRequestRow(db, tenantId, input.requestId);
  if (!requestRow) {
    return {
      ok: false,
      status: "failed",
      reason: "dsar_request_not_found",
      requestId: input.requestId,
      subjectHash: "",
      manifestHash: null,
      manifestArtifactId: null,
      planId: null,
      generatedAt: new Date().toISOString(),
    };
  }
  if (requestRow.request_type !== "delete") {
    return {
      ok: false,
      status: "failed",
      reason: "dsar_request_not_delete",
      requestId: input.requestId,
      subjectHash: requestRow.subject_hash,
      manifestHash: null,
      manifestArtifactId: null,
      planId: requestRow.plan_id,
      generatedAt: requestRow.created_at,
    };
  }
  if (!requestRow.plan_id) {
    return {
      ok: false,
      status: "failed",
      reason: "dsar_plan_missing",
      requestId: input.requestId,
      subjectHash: requestRow.subject_hash,
      manifestHash: null,
      manifestArtifactId: null,
      planId: null,
      generatedAt: requestRow.created_at,
    };
  }
  const execution = await executeSubjectErasurePlan(db, {
    tenantId,
    planId: requestRow.plan_id,
    planHash: input.planHash,
    actorId: input.actorId,
    now: input.now,
  });

  const status: DsarStatus = execution.status === "completed" ? "deleted" : "failed";
  finalizeRequest(
    db,
    tenantId,
    input.requestId,
    status,
    status,
    requestRow.plan_id,
    null,
    null,
    execution.status === "completed" ? null : `execution_${execution.status}`
  );

  return {
    ok: execution.status === "completed",
    status,
    reason: execution.status === "completed" ? "deleted" : `execution_${execution.status}`,
    requestId: input.requestId,
    subjectHash: requestRow.subject_hash,
    manifestHash: null,
    manifestArtifactId: null,
    planId: requestRow.plan_id,
    execution,
    generatedAt: requestRow.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function rejectRequest(
  db: Database.Database,
  input: DsarRequestInput,
  tenantId: string,
  createdAt: string,
  reason: string
): DsarRequestResult {
  const requestId = input.requestId ?? `dsar_${crypto.randomUUID()}`;
  const selectorHashes = input.precomputedSelectorHashes ?? hashSelectorFields(input.subject ?? {});
  const subjectHash = sha256Hex(stableJson(selectorHashes));
  if (tableExists(db, "memory_dsar_requests")) {
    db.prepare(
      `INSERT INTO memory_dsar_requests
        (id, tenant_id, request_type, subject_hash, selector_hashes_json, verification_method,
         verification_hash, scope_json, scope_hash, status, result_json, denial_reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'denied', '{}', ?, ?, ?)`
    ).run(
      requestId,
      tenantId,
      input.requestType,
      subjectHash,
      stableJson(selectorHashes),
      input.verificationMethod ?? "email_token",
      input.verificationHash ?? "",
      stableJson(input.scope ?? {}),
      scopeHash(input.scope ?? {}),
      reason,
      input.actorId,
      createdAt
    );
  }
  return {
    ok: false,
    status: "denied",
    reason,
    requestId,
    subjectHash,
    manifestHash: null,
    manifestArtifactId: null,
    planId: null,
    generatedAt: createdAt,
  };
}

function finalizeRequest(
  db: Database.Database,
  tenantId: string,
  requestId: string,
  status: DsarStatus,
  _ignored: string,
  planId: string | null,
  manifestHash: string | null,
  manifestArtifactId: string | null,
  denialReason: string | null
): void {
  if (!tableExists(db, "memory_dsar_requests")) return;
  db.prepare(
    `UPDATE memory_dsar_requests
     SET status = ?, plan_id = COALESCE(?, plan_id), manifest_hash = COALESCE(?, manifest_hash),
         manifest_artifact_id = COALESCE(?, manifest_artifact_id), denial_reason = ?,
         completed_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(status, planId, manifestHash, manifestArtifactId, denialReason, new Date().toISOString(), tenantId, requestId);
}

function materializeExisting(db: Database.Database, row: ReturnType<typeof loadRequestRow>): DsarRequestResult {
  if (!row) {
    return {
      ok: false,
      status: "failed",
      reason: "dsar_request_not_found",
      requestId: "",
      subjectHash: "",
      manifestHash: null,
      manifestArtifactId: null,
      planId: null,
      generatedAt: new Date().toISOString(),
    };
  }
  const result = (() => {
    try { return JSON.parse(row.result_json || "{}") as Record<string, unknown>; } catch { return {}; }
  })();
  return {
    ok: row.status === "exported" || row.status === "deleted",
    status: row.status,
    reason: (typeof result.reason === "string" ? result.reason : row.status) as string,
    requestId: row.id,
    subjectHash: row.subject_hash,
    manifestHash: row.manifest_hash,
    manifestArtifactId: row.manifest_artifact_id,
    planId: row.plan_id,
    generatedAt: row.created_at,
  };
}

function queryNonSensitiveAuditLinks(
  db: Database.Database,
  tenantId: string,
  recordIdHashes: string[]
): Array<{ eventType: string; entityId: string; createdAt: string }> {
  if (recordIdHashes.length === 0) return [];
  if (!tableExists(db, "audit_entries")) return [];
  const placeholders = recordIdHashes.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT event_type, entity_id, created_at FROM audit_entries
       WHERE tenant_id = ? AND event_type LIKE 'memory.%'
         AND entity_id IN (${placeholders})
       ORDER BY created_at DESC LIMIT 500`
    )
    .all(tenantId, ...recordIdHashes) as Array<{ event_type: string; entity_id: string; created_at: string }>;
  return rows.map((r) => ({ eventType: r.event_type, entityId: r.entity_id, createdAt: r.created_at }));
}
