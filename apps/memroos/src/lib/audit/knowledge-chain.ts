/**
 * Phase 125 / ENTOPS-03: Per-tenant hash-chained audit for knowledge vault ops.
 *
 * Mirrors the structure of `apps/memroos/src/lib/agent-checkpoints.ts` so
 * SIGMA-style chain verification works uniformly across audit domains.
 *
 * Invariants:
 *   - Append-only: pure functions; INSERTs happen in the caller
 *     (route handler uses `writeAuditEntry`).
 *   - One chain per tenant_id for KNOWLEDGE_ACCESS events.
 *   - Hashes are sha256(stableJson(canonical row)).
 *   - `previousEntryHash` is the entryHash of the most recent entry for
 *     the same (tenant_id, event_type=KNOWLEDGE_ACCESS), or null for the
 *     first entry in a tenant's chain.
 *   - metadata_json NEVER contains file content -- path + hashes + ids only.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";

const KNOWLEDGE_CHAIN_VERSION = 1;
const KNOWLEDGE_CHAIN_EVENT = AUDIT_EVENT_TYPES.KNOWLEDGE_ACCESS;
const KNOWLEDGE_CHAIN_ENTITY = ENTITY_TYPES.KNOWLEDGE_VAULT;

export type KnowledgeOperation = "write" | "read" | "delete" | "search";

export interface KnowledgeAuditEntryRow {
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

export interface KnowledgeAuditInsertInput {
  id?: string;
  tenantId: string;
  actorId: string;
  actorRole: "system" | "admin" | "operator" | "reviewer";
  /** Repo-relative path within the tenant vault (e.g. "shared/notes.md"). */
  path: string;
  /** Operation that triggered the audit row. */
  operation: KnowledgeOperation;
  /** Identifier of the agent that initiated the request. */
  agentId: string;
  /** User identity (operator API key → users.tenant_id + users.id). */
  userId?: string | null;
  /** Hash of the operation payload -- sha256(stableJson(path|operation)). */
  opHash: string;
  createdAt?: string;
  reason?: string | null;
}

export interface KnowledgeChainVerification {
  valid: boolean;
  checked: number;
  firstBrokenEntryId?: string;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/* Stable serialization & hashing                                     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Chain primitives                                                    */
/* ------------------------------------------------------------------ */

/**
 * Canonical hash of a knowledge audit row. Stable across processes because
 * the input is sorted + recursively normalized before hashing.
 */
export function knowledgeAuditEntryHash(row: KnowledgeAuditEntryRow): string {
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
 * Returns the entryHash of the most recent KNOWLEDGE_ACCESS entry for
 * this tenant, or null if the chain has no entries yet.
 */
export function previousKnowledgeEntryHash(
  db: Database.Database,
  tenantId: string
): string | null {
  const row = db
    .prepare(
      `SELECT metadata_json
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type = ?
       ORDER BY rowid DESC
       LIMIT 1`
    )
    .get(tenantId, KNOWLEDGE_CHAIN_EVENT) as { metadata_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.metadata_json) as Record<string, unknown>;
    const hash = parsed.entryHash;
    return typeof hash === "string" && hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Insert                                                              */
/* ------------------------------------------------------------------ */

interface KnowledgeAuditInsert {
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

/**
 * Computes the hash chain for an incoming audit entry and returns the
 * fully-formed row ready to be inserted via `writeAuditEntry`.
 *
 * The caller is responsible for the actual INSERT -- this function is
 * pure (only reads `audit_entries` to compute `previousEntryHash`).
 *
 * Throws if `tenantId` or `path` are missing, or if the operation is
 * not in the closed enum.
 */
export function buildKnowledgeAuditEntry(
  db: Database.Database,
  input: KnowledgeAuditInsertInput
): KnowledgeAuditInsert {
  if (!input.tenantId?.trim()) throw new Error("tenantId is required");
  if (!input.path?.trim()) throw new Error("path is required");
  if (!isKnowledgeOperation(input.operation)) {
    throw new Error(`unknown operation: ${String(input.operation)}`);
  }

  const auditEntryId = input.id ?? crypto.randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const previousEntryHash = previousKnowledgeEntryHash(db, input.tenantId);

  const metadataWithoutEntryHash = {
    schemaVersion: KNOWLEDGE_CHAIN_VERSION,
    operation: input.operation,
    path: input.path,
    agentId: input.agentId,
    userId: input.userId ?? null,
    opHash: input.opHash,
    previousEntryHash,
  };
  const rowForHash: KnowledgeAuditEntryRow = {
    id: auditEntryId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    eventType: KNOWLEDGE_CHAIN_EVENT,
    entityType: KNOWLEDGE_CHAIN_ENTITY,
    entityId: `knowledge_vault:${input.tenantId}`,
    reason: input.reason ?? `knowledge ${input.operation} on ${input.path}`,
    metadata: metadataWithoutEntryHash,
    createdAt,
  };
  const entryHash = knowledgeAuditEntryHash(rowForHash);
  const metadata = { ...metadataWithoutEntryHash, entryHash };

  return {
    id: auditEntryId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    eventType: KNOWLEDGE_CHAIN_EVENT,
    entityType: KNOWLEDGE_CHAIN_ENTITY,
    entityId: `knowledge_vault:${input.tenantId}`,
    reason: rowForHash.reason,
    metadata_json: stableJson(metadata),
    created_at: createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

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

function isKnowledgeOperation(op: string): op is KnowledgeOperation {
  return op === "write" || op === "read" || op === "delete" || op === "search";
}

/**
 * Walk the per-tenant chain in insertion order and verify that each row's
 * stored `entryHash` matches its content-derived hash AND links to the
 * previous entry's hash. Stops at the first broken link.
 *
 * Used by the SIEM / tamper-evidence check.
 */
export function verifyKnowledgeAuditChain(
  db: Database.Database,
  tenantId: string
): KnowledgeChainVerification {
  const rows = db
    .prepare(
      `SELECT id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id,
              reason, metadata_json, created_at
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type = ?
       ORDER BY rowid ASC`
    )
    .all(tenantId, KNOWLEDGE_CHAIN_EVENT) as AuditRowForVerify[];

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
    const computed = knowledgeAuditEntryHash({
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
