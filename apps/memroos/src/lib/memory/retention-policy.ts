import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";

export type RetentionDecision =
  | "active"
  | "expired"
  | "held"
  | "skipped_future"
  | "skipped_already_expired"
  | "policy_unavailable"
  | "conflict"
  | "failed"
  | "retried";

export interface RetentionScope {
  tenantId?: string;
  recordType?: string;
  project?: string | null;
  spaceId?: string | null;
  agentId?: string | null;
  sourceType?: string | null;
  [key: string]: unknown;
}

export interface RetentionSecurityLabel {
  visibility?: string | null;
  domain?: string | null;
  sensitivity?: string | null;
  policy?: string | null;
  [key: string]: unknown;
}

export interface RetentionPolicyInput {
  id?: string;
  tenantId?: string;
  name: string;
  version?: string;
  ontologyType: string;
  securityLabel: RetentionSecurityLabel;
  purpose: string;
  scope?: RetentionScope;
  priority?: number;
  durationDays: number;
  action?: "expire" | "tombstone" | "review";
  enabled?: boolean;
  actorId: string;
  now?: Date;
}

export interface RetentionRecordInput {
  id?: string;
  tenantId?: string;
  recordType: string;
  recordId: string;
  ontologyType: string;
  securityLabel: RetentionSecurityLabel;
  purpose: string;
  scope?: RetentionScope;
  createdAt?: string;
  contentHash?: string | null;
  actorId: string;
  now?: Date;
}

export interface RetentionPolicyRow {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  ontology_type: string;
  security_label_json: string;
  purpose: string;
  scope_json: string;
  priority: number;
  duration_days: number;
  action: "expire" | "tombstone" | "review";
  enabled: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RetentionRecordRow {
  id: string;
  tenant_id: string;
  record_type: string;
  record_id: string;
  ontology_type: string;
  security_label_json: string;
  purpose: string;
  scope_json: string;
  policy_id: string | null;
  policy_version: string | null;
  retention_deadline: string | null;
  status: "active" | "expired" | "policy_unavailable" | "failed";
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  expired_at: string | null;
}

export interface RetentionReceipt {
  id: string;
  tenantId: string;
  runKey: string | null;
  recordType: string;
  recordId: string;
  policyId: string | null;
  policyVersion: string | null;
  decision: RetentionDecision;
  reason: string;
  actorId: string;
  scopeHash: string;
  derivativeOutcomes: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RetentionPolicyEvaluation {
  decision: "selected" | "policy_unavailable" | "conflict";
  reason: string;
  selectedPolicy: RetentionPolicyRow | null;
  conflictPolicyIds: string[];
  deadline: string | null;
  scopeHash: string;
}

const SENSITIVE_METADATA_KEYS = [
  "body",
  "content",
  "memory",
  "text",
  "embedding",
  "vector",
  "graph_properties",
  "secret",
  "token",
  "password",
  "credential",
];

function ensureNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function scopeHash(scope: RetentionScope | Record<string, unknown>): string {
  return sha256Hex(stableJson(scope));
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function addUtcDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function objectEntries(value: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(value).filter(([, child]) => child !== undefined && child !== null && child !== "");
}

function matchesSelector(selector: Record<string, unknown>, actual: Record<string, unknown>): boolean {
  for (const [key, expected] of objectEntries(selector)) {
    if (expected === "*") continue;
    const actualValue = actual[key];
    if (Array.isArray(expected)) {
      if (expected.length === 0) return false;
      if (!expected.includes(actualValue)) return false;
      continue;
    }
    if (expected !== actualValue) return false;
  }
  return true;
}

function specificity(selector: Record<string, unknown>): number {
  return objectEntries(selector).reduce((total, [, value]) => {
    if (value === "*") return total;
    if (Array.isArray(value) && value.length === 0) return total;
    return total + 1;
  }, 0);
}

function validateCompleteContext(input: {
  ontologyType?: string | null;
  securityLabel?: RetentionSecurityLabel | null;
  tenantId?: string | null;
  purpose?: string | null;
  scope?: RetentionScope | null;
}): string | null {
  if (!input.tenantId?.trim()) return "missing_tenant";
  if (!input.purpose?.trim()) return "missing_purpose";
  if (!input.ontologyType?.trim()) return "missing_ontology_type";
  if (!input.securityLabel || objectEntries(input.securityLabel).length === 0) return "missing_security_label";
  if (!input.scope || objectEntries(input.scope).length === 0) return "missing_scope";
  return null;
}

function isSensitiveMetadata(value: unknown): boolean {
  const encoded = stableJson(value).toLowerCase();
  return SENSITIVE_METADATA_KEYS.some((key) => encoded.includes(`"${key}"`));
}

function safeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  if (isSensitiveMetadata(metadata)) {
    throw new Error("Retention receipt metadata cannot contain raw memory text, embeddings, graph properties, or secrets");
  }
  return metadata;
}

export function createRetentionPolicy(
  db: Database.Database,
  input: RetentionPolicyInput
): RetentionPolicyRow {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const id = input.id ?? `retpol_${crypto.randomUUID()}`;
  const row = {
    id,
    tenant_id: tenantId,
    name: ensureNonEmpty(input.name, "name"),
    version: ensureNonEmpty(input.version ?? "v1", "version"),
    ontology_type: ensureNonEmpty(input.ontologyType, "ontologyType"),
    security_label_json: stableJson(input.securityLabel),
    purpose: ensureNonEmpty(input.purpose, "purpose"),
    scope_json: stableJson(input.scope ?? { tenantId }),
    priority: input.priority ?? 0,
    duration_days: input.durationDays,
    action: input.action ?? "expire",
    enabled: input.enabled === false ? 0 : 1,
    created_by: ensureNonEmpty(input.actorId, "actorId"),
    created_at: now,
    updated_at: now,
  } satisfies RetentionPolicyRow;
  if (!Number.isInteger(row.duration_days) || row.duration_days < 0) {
    throw new Error("durationDays must be a non-negative integer");
  }
  if (!Number.isInteger(row.priority)) throw new Error("priority must be an integer");

  db.prepare(
    `INSERT INTO memory_retention_policies
      (id, tenant_id, name, version, ontology_type, security_label_json, purpose, scope_json,
       priority, duration_days, action, enabled, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.tenant_id,
    row.name,
    row.version,
    row.ontology_type,
    row.security_label_json,
    row.purpose,
    row.scope_json,
    row.priority,
    row.duration_days,
    row.action,
    row.enabled,
    row.created_by,
    row.created_at,
    row.updated_at
  );

  writeAuditEntry(
    {
      tenant_id: tenantId,
      actor_id: row.created_by,
      actor_role: "operator",
      event_type: AUDIT_EVENT_TYPES.MEMORY_RETENTION_DECISION,
      entity_type: ENTITY_TYPES.MEMORY_RETENTION,
      entity_id: `retention_policy:${row.id}`,
      reason: "retention_policy_created",
      metadata_json: safeMetadata({
        policy_id: row.id,
        version: row.version,
        ontology_type: row.ontology_type,
        label_hash: sha256Hex(row.security_label_json),
        scope_hash: sha256Hex(row.scope_json),
        priority: row.priority,
        duration_days: row.duration_days,
        action: row.action,
      }),
      created_at: now,
    },
    db
  );

  return row;
}

export function evaluateRetentionPolicy(
  db: Database.Database,
  input: {
    tenantId?: string;
    ontologyType?: string | null;
    securityLabel?: RetentionSecurityLabel | null;
    purpose?: string | null;
    scope?: RetentionScope | null;
    createdAt?: string | null;
    now?: Date;
  }
): RetentionPolicyEvaluation {
  const tenantId = input.tenantId ?? "default-tenant";
  const completeContextError = validateCompleteContext({
    tenantId,
    ontologyType: input.ontologyType,
    securityLabel: input.securityLabel,
    purpose: input.purpose,
    scope: input.scope,
  });
  const hash = scopeHash(input.scope ?? {});
  if (completeContextError) {
    return {
      decision: "policy_unavailable",
      reason: completeContextError,
      selectedPolicy: null,
      conflictPolicyIds: [],
      deadline: null,
      scopeHash: hash,
    };
  }

  const policies = db
    .prepare(
      `SELECT * FROM memory_retention_policies
       WHERE tenant_id = ? AND enabled = 1 AND (ontology_type = ? OR ontology_type = '*')
         AND (purpose = ? OR purpose = '*')
       ORDER BY priority DESC, created_at ASC, id ASC`
    )
    .all(tenantId, input.ontologyType, input.purpose) as RetentionPolicyRow[];

  const actualLabel = input.securityLabel ?? {};
  const actualScope = input.scope ?? {};
  const matches = policies
    .filter((policy) => matchesSelector(parseJsonObject(policy.security_label_json), actualLabel))
    .filter((policy) => matchesSelector(parseJsonObject(policy.scope_json), actualScope))
    .map((policy) => {
      const labelSpec = specificity(parseJsonObject(policy.security_label_json));
      const scopeSpec = specificity(parseJsonObject(policy.scope_json));
      const typeSpec = policy.ontology_type === "*" ? 0 : 1;
      const purposeSpec = policy.purpose === "*" ? 0 : 1;
      return { policy, precedence: policy.priority, specificity: labelSpec + scopeSpec + typeSpec + purposeSpec };
    });

  if (matches.length === 0) {
    return {
      decision: "policy_unavailable",
      reason: "no_authorized_policy",
      selectedPolicy: null,
      conflictPolicyIds: [],
      deadline: null,
      scopeHash: hash,
    };
  }

  matches.sort((a, b) => b.precedence - a.precedence || b.specificity - a.specificity || a.policy.id.localeCompare(b.policy.id));
  const [top] = matches;
  const conflicts = matches.filter(
    (candidate) =>
      candidate.policy.id !== top.policy.id &&
      candidate.precedence === top.precedence &&
      candidate.specificity === top.specificity
  );
  if (conflicts.length > 0) {
    return {
      decision: "conflict",
      reason: "overlapping_equal_priority_policies",
      selectedPolicy: null,
      conflictPolicyIds: [top.policy.id, ...conflicts.map((item) => item.policy.id)].sort(),
      deadline: null,
      scopeHash: hash,
    };
  }

  const createdAt = toIso(input.createdAt ?? input.now ?? new Date());
  return {
    decision: "selected",
    reason: "most_specific_policy_selected",
    selectedPolicy: top.policy,
    conflictPolicyIds: [],
    deadline: addUtcDays(createdAt, top.policy.duration_days),
    scopeHash: hash,
  };
}

export function evaluateRetentionDeadline(deadline: string | null, now: Date): RetentionDecision {
  if (!deadline) return "policy_unavailable";
  return new Date(deadline).getTime() <= now.getTime() ? "expired" : "active";
}

export function emitRetentionReceipt(
  db: Database.Database,
  input: {
    tenantId?: string;
    runKey?: string | null;
    recordType: string;
    recordId: string;
    policyId?: string | null;
    policyVersion?: string | null;
    decision: RetentionDecision;
    reason: string;
    actorId: string;
    scope: RetentionScope | Record<string, unknown>;
    derivativeOutcomes?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }
): RetentionReceipt {
  const tenantId = input.tenantId ?? "default-tenant";
  const createdAt = input.createdAt ?? new Date().toISOString();
  const metadata = safeMetadata(input.metadata ?? {});
  const derivativeOutcomes = input.derivativeOutcomes ?? [];
  const receiptId = `retrec_${sha256Hex(
    stableJson({
      runKey: input.runKey ?? null,
      tenantId,
      recordType: input.recordType,
      recordId: input.recordId,
      decision: input.decision,
      reason: input.reason,
      createdAt,
    })
  ).slice(0, 32)}`;
  const hash = scopeHash(input.scope);

  db.prepare(
    `INSERT OR IGNORE INTO memory_retention_receipts
      (id, tenant_id, run_key, record_type, record_id, policy_id, policy_version, decision,
       reason, actor_id, scope_hash, derivative_outcomes_json, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    receiptId,
    tenantId,
    input.runKey ?? null,
    input.recordType,
    input.recordId,
    input.policyId ?? null,
    input.policyVersion ?? null,
    input.decision,
    input.reason,
    input.actorId,
    hash,
    stableJson(derivativeOutcomes),
    stableJson(metadata),
    createdAt
  );

  writeAuditEntry(
    {
      tenant_id: tenantId,
      actor_id: input.actorId,
      actor_role: input.actorId === "system" ? "system" : "operator",
      event_type: AUDIT_EVENT_TYPES.MEMORY_RETENTION_DECISION,
      entity_type: ENTITY_TYPES.MEMORY_RETENTION,
      entity_id: `${input.recordType}:${input.recordId}`,
      reason: input.reason,
      metadata_json: {
        receipt_id: receiptId,
        run_key: input.runKey ?? null,
        record_type: input.recordType,
        record_id: input.recordId,
        policy_id: input.policyId ?? null,
        policy_version: input.policyVersion ?? null,
        decision: input.decision,
        scope_hash: hash,
        derivative_outcomes: derivativeOutcomes,
        metadata,
      },
      created_at: createdAt,
    },
    db
  );

  return {
    id: receiptId,
    tenantId,
    runKey: input.runKey ?? null,
    recordType: input.recordType,
    recordId: input.recordId,
    policyId: input.policyId ?? null,
    policyVersion: input.policyVersion ?? null,
    decision: input.decision,
    reason: input.reason,
    actorId: input.actorId,
    scopeHash: hash,
    derivativeOutcomes,
    metadata,
    createdAt,
  };
}

export function registerRetentionRecord(
  db: Database.Database,
  input: RetentionRecordInput
): { record: RetentionRecordRow; evaluation: RetentionPolicyEvaluation; receipt: RetentionReceipt } {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const createdAt = input.createdAt ? toIso(input.createdAt) : now;
  const id = input.id ?? `retrec_${crypto.randomUUID()}`;
  const evaluation = evaluateRetentionPolicy(db, {
    tenantId,
    ontologyType: input.ontologyType,
    securityLabel: input.securityLabel,
    purpose: input.purpose,
    scope: input.scope ?? { tenantId, recordType: input.recordType },
    createdAt,
    now: input.now,
  });
  const policy = evaluation.selectedPolicy;
  const status = evaluation.decision === "selected" ? "active" : "policy_unavailable";

  const record = {
    id,
    tenant_id: tenantId,
    record_type: ensureNonEmpty(input.recordType, "recordType"),
    record_id: ensureNonEmpty(input.recordId, "recordId"),
    ontology_type: ensureNonEmpty(input.ontologyType, "ontologyType"),
    security_label_json: stableJson(input.securityLabel),
    purpose: ensureNonEmpty(input.purpose, "purpose"),
    scope_json: stableJson(input.scope ?? { tenantId, recordType: input.recordType }),
    policy_id: policy?.id ?? null,
    policy_version: policy?.version ?? null,
    retention_deadline: evaluation.deadline,
    status,
    content_hash: input.contentHash ?? null,
    created_at: createdAt,
    updated_at: now,
    expired_at: null,
  } satisfies RetentionRecordRow;

  db.prepare(
    `INSERT INTO memory_retention_records
      (id, tenant_id, record_type, record_id, ontology_type, security_label_json, purpose, scope_json,
       policy_id, policy_version, retention_deadline, status, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, record_type, record_id) DO UPDATE SET
       ontology_type = excluded.ontology_type,
       security_label_json = excluded.security_label_json,
       purpose = excluded.purpose,
       scope_json = excluded.scope_json,
       policy_id = excluded.policy_id,
       policy_version = excluded.policy_version,
       retention_deadline = excluded.retention_deadline,
       status = excluded.status,
       content_hash = excluded.content_hash,
       updated_at = excluded.updated_at`
  ).run(
    record.id,
    record.tenant_id,
    record.record_type,
    record.record_id,
    record.ontology_type,
    record.security_label_json,
    record.purpose,
    record.scope_json,
    record.policy_id,
    record.policy_version,
    record.retention_deadline,
    record.status,
    record.content_hash,
    record.created_at,
    record.updated_at
  );

  const receipt = emitRetentionReceipt(db, {
    tenantId,
    recordType: record.record_type,
    recordId: record.record_id,
    policyId: record.policy_id,
    policyVersion: record.policy_version,
    decision: evaluation.decision === "selected" ? evaluateRetentionDeadline(record.retention_deadline, input.now ?? new Date()) : evaluation.decision,
    reason: evaluation.reason,
    actorId: input.actorId,
    scope: parseJsonObject(record.scope_json),
    derivativeOutcomes: [{ store: record.record_type, outcome: "registered" }],
    metadata: {
      record_id: record.record_id,
      record_type: record.record_type,
      policy_id: record.policy_id,
      policy_version: record.policy_version,
      retention_deadline: record.retention_deadline,
      content_hash: record.content_hash,
      label_hash: sha256Hex(record.security_label_json),
      scope_hash: sha256Hex(record.scope_json),
      conflict_policy_ids: evaluation.conflictPolicyIds,
    },
    createdAt: now,
  });

  return { record, evaluation, receipt };
}

export function listRetentionReceipts(
  db: Database.Database,
  input: { tenantId?: string; recordId?: string; runKey?: string; limit?: number }
): RetentionReceipt[] {
  const tenantId = input.tenantId ?? "default-tenant";
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const clauses = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (input.recordId) {
    clauses.push("record_id = ?");
    params.push(input.recordId);
  }
  if (input.runKey) {
    clauses.push("run_key = ?");
    params.push(input.runKey);
  }
  params.push(limit);
  const rows = db
    .prepare(
      `SELECT * FROM memory_retention_receipts
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(...params) as Array<{
    id: string;
    tenant_id: string;
    run_key: string | null;
    record_type: string;
    record_id: string;
    policy_id: string | null;
    policy_version: string | null;
    decision: RetentionDecision;
    reason: string;
    actor_id: string;
    scope_hash: string;
    derivative_outcomes_json: string;
    metadata_json: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    runKey: row.run_key,
    recordType: row.record_type,
    recordId: row.record_id,
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    decision: row.decision,
    reason: row.reason,
    actorId: row.actor_id,
    scopeHash: row.scope_hash,
    derivativeOutcomes: JSON.parse(row.derivative_outcomes_json || "[]") as Array<Record<string, unknown>>,
    metadata: JSON.parse(row.metadata_json || "{}") as Record<string, unknown>,
    createdAt: row.created_at,
  }));
}
