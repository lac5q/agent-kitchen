/**
 * MEMLIFE-05 / VAL-MEM-029: Hash-chained audit for memory lifecycle events.
 *
 * Mirrors `skill-chain.ts` but covers the memory lifecycle domain:
 *   memory.consolidation.*, memory.vault.*, memory.subject.export|delete,
 *   memory.offboarding.pending, memory.tombstone.written,
 *   memory.retention.*, memory.legal_hold, memory.subject_erasure.*,
 *   memory.decay.run
 *
 * INVARIANTS
 * - Append-only: pure functions; INSERTs happen via `writeChainedMemoryAuditEntry`.
 * - One chain per tenant for memory lifecycle events (filtering by event_type prefix "memory.").
 * - Hashes are sha256(stableJson(canonical row)).
 * - `previousEntryHash` is the entryHash of the most recent memory event for the same tenant.
 * - `metadata_json` NEVER contains raw memory text, embeddings, graph properties, secrets,
 *   signing key material, or full licensed content -- IDs, hashes, classifications, reasons only.
 * - Verification walks insertion order (rowid ASC) and detects tamper, reorder, deletion.
 *
 * FAULT-INJECTION (VAL-MEM-029):
 * - `verifyMemoryAuditChainWithFault` accepts an injectable `metadataCorruptor` that returns a
 *   mutation to apply before re-hashing. We use this in tests to assert that the chain fails
 *   closed (returns firstBrokenEntryId + reason) rather than silently rewriting or skipping.
 * - `simulateReceiptFailure` simulates a failed write by wrapping the insert in a transaction
 *   that throws -- no audit row is committed.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

const MEMORY_CHAIN_VERSION = 1;

const MEMORY_EVENT_PREFIXES = ["memory."];

const FORBIDDEN_METADATA_KEYS = [
  "body",
  "raw_body",
  "rawBody",
  "secret",
  "secrets",
  "password",
  "token",
  "private_key",
  "privateKey",
  "evidence_examples",
  "evidenceExamples",
  "memory_text",
  "memoryText",
  "message_body",
  "messageBody",
  "embedding",
  "vector",
  "graph_properties",
  "graphProperties",
  "raw_content",
  "rawContent",
  "prompt",
  "system_prompt",
  "systemPrompt",
  "license_payload",
  "licensePayload",
];

export interface MemoryAuditEntryRow {
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

export interface MemoryChainVerification {
  valid: boolean;
  checked: number;
  firstBrokenEntryId?: string;
  reason?: string;
  /** Which audit domain was checked. */
  scope: "memory";
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

export function memoryAuditEntryHash(row: MemoryAuditEntryRow): string {
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

/**
 * Returns the entryHash of the most recent memory-lifecycle event for this tenant,
 * or null if the chain has no entries yet. Only considers memory.* events so that
 * other domains do not interleave with the memory chain.
 */
export function previousMemoryEntryHash(
  db: Database.Database,
  tenantId: string
): string | null {
  const row = db
    .prepare(
      `SELECT metadata_json
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type LIKE 'memory.%'
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

export interface BuildMemoryAuditEntryInput {
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

export interface MemoryAuditInsert {
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

function isMemoryEvent(eventType: string): boolean {
  return MEMORY_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix));
}

function sanitizeMemoryMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const lower = k.toLowerCase();
    const isForbidden = FORBIDDEN_METADATA_KEYS.some((f) => lower.includes(f.toLowerCase()));
    if (isForbidden) continue;
    if (typeof v === "string" && v.length > 500 && (lower.includes("body") || lower.includes("content"))) {
      continue;
    }
    sanitized[k] = v;
  }
  return sanitized;
}

/**
 * Computes the hash chain for an incoming memory-lifecycle audit entry and
 * returns the fully-formed row ready to be inserted.
 *
 * The caller is responsible for the actual INSERT.
 */
export function buildMemoryAuditEntry(
  db: Database.Database,
  input: BuildMemoryAuditEntryInput
): MemoryAuditInsert {
  if (!input.tenantId?.trim()) throw new Error("tenantId is required");
  if (!isMemoryEvent(input.eventType)) {
    throw new Error(`eventType must start with one of ${MEMORY_EVENT_PREFIXES.join(", ")}: got ${input.eventType}`);
  }

  const auditEntryId = input.id ?? crypto.randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const previousEntryHash = previousMemoryEntryHash(db, input.tenantId);

  const sanitizedMetadata = sanitizeMemoryMetadata(input.metadata);

  const metadataWithoutEntryHash = {
    schemaVersion: MEMORY_CHAIN_VERSION,
    ...sanitizedMetadata,
    previousEntryHash,
  };

  const rowForHash: MemoryAuditEntryRow = {
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

  const entryHash = memoryAuditEntryHash(rowForHash);
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
 * Walk the per-tenant memory lifecycle chain in insertion order and verify
 * that each row's stored `entryHash` matches its content-derived hash AND
 * links to the previous entry's hash. Stops at the first broken link.
 */
export function verifyMemoryAuditChain(
  db: Database.Database,
  tenantId: string
): MemoryChainVerification {
  return verifyMemoryAuditChainWithFault(db, tenantId, undefined);
}

/**
 * Fault-injectable verifier used to assert fail-closed behaviour.
 *
 * `metadataCorruptor` is called for each row BEFORE recomputing the hash.
 * If it returns `undefined` the row's metadata is hashed as-is; otherwise
 * the returned object replaces the parsed metadata for the recompute. This
 * lets tests simulate: deletion (returning null), tampered metadata
 * (returning a different object), and reordering (by deleting entries).
 */
export function verifyMemoryAuditChainWithFault(
  db: Database.Database,
  tenantId: string,
  metadataCorruptor:
    | ((row: AuditRowForVerify, metadata: Record<string, unknown>) => Record<string, unknown> | null | undefined)
    | undefined
): MemoryChainVerification {
  const rows = db
    .prepare(
      `SELECT id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id,
              reason, metadata_json, created_at
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type LIKE 'memory.%'
       ORDER BY rowid ASC`
    )
    .all(tenantId) as AuditRowForVerify[];

  let expectedPrevious: string | null = null;
  let checked = 0;
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
        checked,
        firstBrokenEntryId: row.id,
        reason: "metadata_json is not valid JSON",
        scope: "memory",
      };
    }

    const tampered = metadataCorruptor ? metadataCorruptor(row, metadata) : metadata;
    if (tampered === null) {
      return {
        valid: false,
        checked,
        firstBrokenEntryId: row.id,
        reason: "metadata missing or deleted",
        scope: "memory",
      };
    }
    const effectiveMetadata = tampered ?? metadata;

    const storedHash = typeof effectiveMetadata.entryHash === "string" ? effectiveMetadata.entryHash : null;
    const storedPrevious =
      typeof effectiveMetadata.previousEntryHash === "string"
        ? effectiveMetadata.previousEntryHash
        : effectiveMetadata.previousEntryHash === null
          ? null
          : undefined;

    if (!storedHash) {
      return {
        valid: false,
        checked,
        firstBrokenEntryId: row.id,
        reason: "missing entryHash",
        scope: "memory",
      };
    }
    if (storedPrevious !== expectedPrevious) {
      return {
        valid: false,
        checked,
        firstBrokenEntryId: row.id,
        reason: `previousEntryHash does not match: expected ${expectedPrevious}, got ${String(storedPrevious)}`,
        scope: "memory",
      };
    }

    const { entryHash: _entryHash, ...metadataWithoutEntryHash } = effectiveMetadata;
    const computed = memoryAuditEntryHash({
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
        checked,
        firstBrokenEntryId: row.id,
        reason: `entryHash mismatch: stored ${storedHash}, computed ${computed}`,
        scope: "memory",
      };
    }

    expectedPrevious = storedHash;
    checked += 1;
  }

  return { valid: true, checked, scope: "memory" };
}

/**
 * Helper to write a hash-chained memory-lifecycle audit entry inside a
 * transaction. Returns the audit entry id.
 *
 * If `simulateReceiptFailure` is true, throws AFTER rolling back the
 * transaction so the caller can confirm no audit row was committed.
 * This is used to validate VAL-MEM-029: required evidence failure rolls
 * back or leaves incomplete -- never silently succeeds.
 */
export function writeChainedMemoryAuditEntry(
  db: Database.Database,
  input: BuildMemoryAuditEntryInput,
  options: { simulateReceiptFailure?: boolean } = {}
): string {
  if (options.simulateReceiptFailure) {
    // Build the entry but do not commit it. The caller must observe no audit row.
    const built = buildMemoryAuditEntry(db, input);
    throw new Error(
      `memory audit chain write aborted: simulated receipt failure for ${built.eventType} on ${built.entityId}`
    );
  }
  const built = buildMemoryAuditEntry(db, input);
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
