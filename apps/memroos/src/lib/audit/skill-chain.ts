/**
 * Phase 150+ / VAL-SKILL-039: Hash-chained audit for skill governance events.
 *
 * Mirrors knowledge-chain.ts but covers skill domain events:
 *   skill_lifecycle_transitioned, skill_lifecycle_deprecated,
 *   skill.sync.*, skill.pin.*, skill.proposal.*, skill.quarantine.*
 *
 * Invariants:
 *   - Append-only: pure functions; INSERTs happen via transactional wrappers.
 *   - One chain per tenant for skill events (filtering event_type prefix "skill.").
 *   - Hashes are sha256(stableJson(canonical row)).
 *   - previousEntryHash is the entryHash of most recent skill event for same tenant.
 *   - metadata_json NEVER contains raw_body, secrets, or evidence_examples — only
 *     IDs/hashes/classifications/reasons.
 *   - Verification walks insertion order (rowid ASC) and detects tamper/reorder/deletion.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

const SKILL_CHAIN_VERSION = 1;

// All skill audit events share the "skill." prefix
const SKILL_EVENT_PREFIXES = ["skill.", "skill_"];

export interface SkillAuditEntryRow {
  id: string;
  tenantId: string;
  actorId: string;
  actorRole: string;
  eventType: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SkillChainVerification {
  valid: boolean;
  checked: number;
  firstBrokenEntryId?: string;
  reason?: string;
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeStable(entryValue)])
    );
  }
  return value;
}

function hashText(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function hashJson(value: unknown): string {
  return hashText(stableJson(value));
}

export function skillAuditEntryHash(row: SkillAuditEntryRow): string {
  return hashJson({
    id: row.id,
    tenantId: row.tenantId,
    actorId: row.actorId,
    actorRole: row.actorRole,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.createdAt,
  });
}

export function previousSkillEntryHash(
  db: Database.Database,
  tenantId: string
): string | null {
  const row = db
    .prepare(
      `SELECT metadata_json
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type LIKE 'skill_%'
       ORDER BY rowid DESC
       LIMIT 1`
    )
    .get(tenantId) as { metadata_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.metadata_json) as Record<string, unknown>;
    const hash = parsed.entryHash;
    return typeof hash === "string" && hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

export interface BuildSkillAuditEntryInput {
  id?: string;
  tenantId: string;
  actorId: string;
  actorRole: "system" | "admin" | "operator" | "reviewer";
  eventType: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string;
}

interface SkillAuditInsert {
  id: string;
  tenantId: string;
  actorId: string;
  actorRole: string;
  eventType: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  metadata_json: string;
  created_at: string;
}

export function buildSkillAuditEntry(
  db: Database.Database,
  input: BuildSkillAuditEntryInput
): SkillAuditInsert {
  if (!input.tenantId?.trim()) throw new Error("tenantId is required");
  if (!SKILL_EVENT_PREFIXES.some(p => input.eventType?.startsWith(p))) {
    throw new Error(`eventType must start with one of ${SKILL_EVENT_PREFIXES.join(", ")}`);
  }

  const auditEntryId = input.id ?? crypto.randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const previousEntryHash = previousSkillEntryHash(db, input.tenantId);

  // Ensure metadata does NOT contain raw_body, secrets, evidence_examples (redaction)
  const sanitizedMetadata = sanitizeSkillMetadata(input.metadata);

  const metadataWithoutEntryHash = {
    schemaVersion: SKILL_CHAIN_VERSION,
    ...sanitizedMetadata,
    previousEntryHash,
  };

  const rowForHash: SkillAuditEntryRow = {
    id: auditEntryId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason ?? null,
    metadata: metadataWithoutEntryHash,
    createdAt,
  };

  const entryHash = skillAuditEntryHash(rowForHash);
  const metadata = { ...metadataWithoutEntryHash, entryHash };

  return {
    id: auditEntryId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: rowForHash.reason,
    metadata_json: stableJson(metadata),
    created_at: createdAt,
  };
}

function sanitizeSkillMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  // VAL-039: redact sensitive fields — never include raw_body, secrets, evidence_examples, raw content
  const forbidden = ["raw_body", "rawBody", "secret", "secrets", "evidence_examples", "evidenceExamples", "private_key", "privateKey", "token", "password", "signature_raw"];
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const lower = k.toLowerCase();
    const isForbidden = forbidden.some(f => lower.includes(f.toLowerCase()));
    if (isForbidden) continue;
    // Also redact if value looks like a long raw body (heuristic: >500 chars string)
    if (typeof v === "string" && v.length > 500 && (k.toLowerCase().includes("body") || k.toLowerCase().includes("content"))) {
      continue;
    }
    sanitized[k] = v;
  }
  return sanitized;
}

interface AuditRowForVerify {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_role: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  metadata_json: string;
  created_at: string;
}

/**
 * Verify per-tenant hash chain for skill domain events.
 * Detects tamper, reorder, deletion via hash linking.
 */
export function verifySkillAuditChain(
  db: Database.Database,
  tenantId: string
): SkillChainVerification {
  const rows = db
    .prepare(
      `SELECT id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id,
              reason, metadata_json, created_at
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type LIKE 'skill_%'
       ORDER BY rowid ASC`
    )
    .all(tenantId) as AuditRowForVerify[];

  let expectedPrevious: string | null = null;
  for (const row of rows) {
    let metadata: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.metadata_json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      return {
        valid: false,
        checked: 0,
        firstBrokenEntryId: row.id,
        reason: "metadata_json is not valid JSON",
      };
    }

    const storedHash =
      typeof metadata.entryHash === "string" ? metadata.entryHash : null;
    const storedPrevious =
      typeof metadata.previousEntryHash === "string"
        ? metadata.previousEntryHash
        : metadata.previousEntryHash === null
          ? null
          : undefined;

    if (!storedHash) {
      return {
        valid: false,
        checked: 0,
        firstBrokenEntryId: row.id,
        reason: "missing entryHash",
      };
    }
    if (storedPrevious !== expectedPrevious) {
      return {
        valid: false,
        checked: 0,
        firstBrokenEntryId: row.id,
        reason: `previousEntryHash does not match: expected ${expectedPrevious}, got ${String(storedPrevious)}`,
      };
    }

    const { entryHash: _omit, ...metadataWithoutEntryHash } = metadata;
    const computed = skillAuditEntryHash({
      id: row.id,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      reason: row.reason,
      metadata: metadataWithoutEntryHash as Record<string, unknown>,
      createdAt: row.created_at,
    });

    if (computed !== storedHash) {
      return {
        valid: false,
        checked: 0,
        firstBrokenEntryId: row.id,
        reason: `entryHash mismatch: stored ${storedHash}, computed ${computed}`,
      };
    }

    expectedPrevious = storedHash;
  }

  return { valid: true, checked: rows.length };
}

/**
 * Helper to write a hash-chained skill audit entry inside a transaction.
 * The caller must be in a transaction or this will still work (writes directly).
 */
export function writeChainedSkillAuditEntry(
  db: Database.Database,
  input: BuildSkillAuditEntryInput
): string {
  const built = buildSkillAuditEntry(db, input);
  db.prepare(
    `INSERT INTO audit_entries
      (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    built.id,
    built.tenantId,
    built.actorId,
    built.actorRole,
    built.eventType,
    built.entityType,
    built.entityId,
    built.reason,
    built.metadata_json,
    built.created_at
  );
  return built.id;
}
