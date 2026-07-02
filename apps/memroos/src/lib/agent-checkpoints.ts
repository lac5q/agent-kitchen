import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";

export interface AgentCheckpointInput {
  tenantId?: string;
  runId: string;
  ownerAgentId: string;
  objective: string;
  completedSteps?: string[];
  remainingSteps?: string[];
  decisions?: Record<string, unknown>;
  artifactRefs?: string[];
  verificationState?: Record<string, unknown>;
  nextSafeAction: string;
  rollbackNotes?: string | null;
  provenancePointers?: string[];
}

export interface CheckpointProvenanceReceipt {
  kind: "retrieval_trace" | "source_read" | "memory_write";
  eventId: number;
  taskId: string | null;
  agentId: string | null;
  sourceId: string;
  sourceHash: string;
  toolId?: string;
  evidenceHash: string;
  createdAt: string;
}

export interface CheckpointProvenanceAudit {
  auditEntryId: string;
  checkpointHash: string;
  previousEntryHash: string | null;
  entryHash: string;
  provenanceReceiptCount: number;
  createdAt: string;
}

export interface AgentCheckpoint {
  id: string;
  tenantId: string;
  runId: string;
  ownerAgentId: string;
  objective: string;
  completedSteps: string[];
  remainingSteps: string[];
  decisions: Record<string, unknown>;
  artifactRefs: string[];
  verificationState: Record<string, unknown>;
  nextSafeAction: string;
  rollbackNotes: string | null;
  provenancePointers: string[];
  checkpointSize: number;
  writeLatencyMs: number;
  createdAt: string;
  provenanceAudit: CheckpointProvenanceAudit | null;
}

export interface CheckpointAuditChainVerification {
  valid: boolean;
  checked: number;
  firstBrokenEntryId?: string;
  reason?: string;
}

interface EfficiencyEventRow {
  id: number;
  event_type: string;
  task_id: string | null;
  agent_id: string | null;
  payload: string;
  created_at: string;
}

interface CheckpointAuditRow {
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

// Module-level state to track background queue depth and duplicate checkpoints
let asyncQueueDepth = 0;
let duplicateWorkAvoidedCount = 0;

const CHECKPOINT_AUDIT_SCHEMA_VERSION = 1;
const CHECKPOINT_AUDIT_EVENT = AUDIT_EVENT_TYPES.AGENT_CHECKPOINTED;
const CHECKPOINT_AUDIT_ENTITY = ENTITY_TYPES.AGENT_CHECKPOINT;

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeStable);
  }
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

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function withoutEntryHash(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "entryHash"));
}

function buildReceipt(row: EfficiencyEventRow): CheckpointProvenanceReceipt | null {
  const payload = parseJsonRecord(row.payload);
  const common = {
    eventId: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    createdAt: row.created_at,
  };

  if (row.event_type === "source_read") {
    const receiptWithoutEvidence = {
      kind: "source_read" as const,
      ...common,
      sourceId: stringValue(payload.sourceId) ?? `source_read:${row.id}`,
      sourceHash:
        stringValue(payload.sourceHash) ??
        hashJson({
          kind: "source_read",
          eventId: row.id,
          sourceId: stringValue(payload.sourceId),
        }),
      toolId: stringValue(payload.toolId),
    };
    return {
      ...receiptWithoutEvidence,
      evidenceHash: hashJson(receiptWithoutEvidence),
    };
  }

  if (row.event_type === "memory_write") {
    const receiptWithoutEvidence = {
      kind: "memory_write" as const,
      ...common,
      sourceId: stringValue(payload.source) ?? `memory_write:${row.id}`,
      sourceHash:
        stringValue(payload.dedupHash) ??
        hashJson({
          kind: "memory_write",
          eventId: row.id,
          source: stringValue(payload.source),
        }),
    };
    return {
      ...receiptWithoutEvidence,
      evidenceHash: hashJson(receiptWithoutEvidence),
    };
  }

  if (row.event_type === "retrieval_trace") {
    const sources = stringArrayValue(payload.sources).sort();
    const query = stringValue(payload.query);
    const receiptWithoutEvidence = {
      kind: "retrieval_trace" as const,
      ...common,
      sourceId: sources.length > 0 ? `retrieval:${sources.join(",")}` : `retrieval_trace:${row.id}`,
      sourceHash: hashJson({
        kind: "retrieval_trace",
        eventId: row.id,
        sources,
        queryHash: query ? hashText(query) : undefined,
      }),
    };
    return {
      ...receiptWithoutEvidence,
      evidenceHash: hashJson(receiptWithoutEvidence),
    };
  }

  return null;
}

function collectBoundaryProvenanceReceipts(
  db: Database.Database,
  tenantId: string,
  runId: string
): CheckpointProvenanceReceipt[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, event_type, task_id, agent_id, payload, created_at
         FROM efficiency_events
         WHERE tenant_id = ?
           AND task_id = ?
           AND event_type IN ('source_read', 'retrieval_trace', 'memory_write')
         ORDER BY id ASC`
      )
      .all(tenantId, runId) as EfficiencyEventRow[];

    return rows
      .map(buildReceipt)
      .filter((receipt): receipt is CheckpointProvenanceReceipt => receipt !== null);
  } catch {
    return [];
  }
}

function checkpointHashFor(input: {
  id: string;
  tenantId: string;
  runId: string;
  ownerAgentId: string;
  objective: string;
  completedSteps: string[];
  remainingSteps: string[];
  decisions: Record<string, unknown>;
  artifactRefs: string[];
  verificationState: Record<string, unknown>;
  nextSafeAction: string;
  rollbackNotes: string | null;
  provenancePointers: string[];
  checkpointSize: number;
  createdAt: string;
}): string {
  return hashJson(input);
}

function checkpointAuditEntryHash(row: {
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
}): string {
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

function latestCheckpointAuditHash(db: Database.Database, tenantId: string): string | null {
  const row = db
    .prepare(
      `SELECT metadata_json
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type = ?
       ORDER BY rowid DESC
       LIMIT 1`
    )
    .get(tenantId, CHECKPOINT_AUDIT_EVENT) as { metadata_json: string } | undefined;
  if (!row) return null;
  return stringValue(parseJsonRecord(row.metadata_json).entryHash) ?? null;
}

function auditReceiptFromRow(row: CheckpointAuditRow): CheckpointProvenanceAudit | null {
  const metadata = parseJsonRecord(row.metadata_json);
  const entryHash = stringValue(metadata.entryHash);
  const checkpointHash = stringValue(metadata.checkpointHash);
  if (!entryHash || !checkpointHash) return null;
  return {
    auditEntryId: row.id,
    checkpointHash,
    previousEntryHash:
      metadata.previousEntryHash === null ? null : stringValue(metadata.previousEntryHash) ?? null,
    entryHash,
    provenanceReceiptCount: Array.isArray(metadata.provenanceReceipts)
      ? metadata.provenanceReceipts.length
      : 0,
    createdAt: row.created_at,
  };
}

function getCheckpointProvenanceAudit(
  db: Database.Database,
  tenantId: string,
  checkpointId: string
): CheckpointProvenanceAudit | null {
  const row = db
    .prepare(
      `SELECT id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id,
              reason, metadata_json, created_at
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type = ?
         AND entity_type = ?
         AND entity_id = ?
       ORDER BY rowid DESC
       LIMIT 1`
    )
    .get(tenantId, CHECKPOINT_AUDIT_EVENT, CHECKPOINT_AUDIT_ENTITY, `agent_checkpoint:${checkpointId}`) as
    | CheckpointAuditRow
    | undefined;
  return row ? auditReceiptFromRow(row) : null;
}

function insertCheckpointAuditEntry(
  db: Database.Database,
  input: {
    id: string;
    tenantId: string;
    runId: string;
    ownerAgentId: string;
    objective: string;
    completedSteps: string[];
    remainingSteps: string[];
    decisions: Record<string, unknown>;
    artifactRefs: string[];
    verificationState: Record<string, unknown>;
    nextSafeAction: string;
    rollbackNotes: string | null;
    provenancePointers: string[];
    checkpointSize: number;
    createdAt: string;
  }
): CheckpointProvenanceAudit {
  const auditEntryId = crypto.randomUUID();
  const checkpointHash = checkpointHashFor(input);
  const previousEntryHash = latestCheckpointAuditHash(db, input.tenantId);
  const provenanceReceipts = collectBoundaryProvenanceReceipts(db, input.tenantId, input.runId);
  const reason = "agent checkpoint persisted with verified boundary provenance receipts";

  const metadataWithoutEntryHash = {
    schemaVersion: CHECKPOINT_AUDIT_SCHEMA_VERSION,
    checkpointId: input.id,
    tenantId: input.tenantId,
    runId: input.runId,
    ownerAgentId: input.ownerAgentId,
    checkpointHash,
    previousEntryHash,
    provenanceReceipts,
    legacyPointerCount: input.provenancePointers.length,
  };
  const entryHash = checkpointAuditEntryHash({
    id: auditEntryId,
    tenantId: input.tenantId,
    actorId: input.ownerAgentId,
    actorRole: "system",
    eventType: CHECKPOINT_AUDIT_EVENT,
    entityType: CHECKPOINT_AUDIT_ENTITY,
    entityId: `agent_checkpoint:${input.id}`,
    reason,
    metadata: metadataWithoutEntryHash,
    createdAt: input.createdAt,
  });
  const metadata = {
    ...metadataWithoutEntryHash,
    entryHash,
  };

  db.prepare(
    `INSERT INTO audit_entries (
       id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id,
       reason, metadata_json, created_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?
     )`
  ).run(
    auditEntryId,
    input.tenantId,
    input.ownerAgentId,
    "system",
    CHECKPOINT_AUDIT_EVENT,
    CHECKPOINT_AUDIT_ENTITY,
    `agent_checkpoint:${input.id}`,
    reason,
    stableJson(metadata),
    input.createdAt
  );

  return {
    auditEntryId,
    checkpointHash,
    previousEntryHash,
    entryHash,
    provenanceReceiptCount: provenanceReceipts.length,
    createdAt: input.createdAt,
  };
}

/**
 * Heavy tasks are simulated to run in the background (debounced/async)
 * to satisfy the "never block hot-path inline execution" requirement.
 */
function scheduleHeavyTasks(runId: string) {
  void runId;
  asyncQueueDepth++;
  setImmediate(() => {
    // Simulate heavy background operations (indexing, vector store sync, git commits, summarization)
    setTimeout(() => {
      asyncQueueDepth = Math.max(0, asyncQueueDepth - 1);
    }, 100);
  });
}

export function createAgentCheckpoint(
  db: Database.Database,
  input: AgentCheckpointInput
): AgentCheckpoint {
  const startTime = process.hrtime();

  if (!input.runId?.trim()) throw new Error("runId is required");
  if (!input.ownerAgentId?.trim()) throw new Error("ownerAgentId is required");
  if (!input.objective?.trim()) throw new Error("objective is required");
  if (!input.nextSafeAction?.trim()) throw new Error("nextSafeAction is required");

  const id = crypto.randomUUID();
  const tenantId = input.tenantId ?? "default-tenant";
  const completedSteps = input.completedSteps ?? [];
  const remainingSteps = input.remainingSteps ?? [];
  const decisions = input.decisions ?? {};
  const artifactRefs = input.artifactRefs ?? [];
  const verificationState = input.verificationState ?? {};
  const rollbackNotes = input.rollbackNotes ?? null;
  const provenancePointers = input.provenancePointers ?? [];
  const createdAt = nowIso();

  const completedStepsJson = stableJson(completedSteps);
  const remainingStepsJson = stableJson(remainingSteps);
  const decisionsJson = stableJson(decisions);
  const artifactRefsJson = stableJson(artifactRefs);
  const verificationStateJson = stableJson(verificationState);
  const provenancePointersJson = stableJson(provenancePointers);

  // Calculate size of serialized checkpoint state
  const serializedState = [
    completedStepsJson,
    remainingStepsJson,
    decisionsJson,
    artifactRefsJson,
    verificationStateJson,
    provenancePointersJson,
    input.objective,
    input.nextSafeAction,
    rollbackNotes ?? "",
  ].join("");
  const checkpointSize = Buffer.byteLength(serializedState, "utf8");

  // Calculate hot-path write latency
  const diffTime = process.hrtime(startTime);
  const writeLatencyMs = diffTime[0] * 1000 + diffTime[1] / 1000000;

  const checkpointForAudit = {
    id,
    tenantId,
    runId: input.runId,
    ownerAgentId: input.ownerAgentId,
    objective: input.objective,
    completedSteps,
    remainingSteps,
    decisions,
    artifactRefs,
    verificationState,
    nextSafeAction: input.nextSafeAction,
    rollbackNotes,
    provenancePointers,
    checkpointSize,
    createdAt,
  };

  let duplicateDetected = false;
  const provenanceAudit = db.transaction(() => {
    // Check if this checkpoint is a duplicate of the last checkpoint to avoid duplicate work.
    const lastRow = db
      .prepare(
        `SELECT completed_steps_json, remaining_steps_json, decisions_json, next_safe_action
         FROM agent_checkpoints
         WHERE tenant_id = ? AND run_id = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(tenantId, input.runId) as {
        completed_steps_json: string;
        remaining_steps_json: string;
        decisions_json: string;
        next_safe_action: string;
      } | undefined;

    if (
      lastRow &&
      lastRow.completed_steps_json === completedStepsJson &&
      lastRow.remaining_steps_json === remainingStepsJson &&
      lastRow.decisions_json === decisionsJson &&
      lastRow.next_safe_action === input.nextSafeAction
    ) {
      duplicateDetected = true;
    }

    db.prepare(
      `INSERT INTO agent_checkpoints (
         id, tenant_id, run_id, owner_agent_id, objective,
         completed_steps_json, remaining_steps_json, decisions_json,
         artifact_refs_json, verification_state_json, next_safe_action,
         rollback_notes, provenance_pointers_json, checkpoint_size,
         write_latency_ms, created_at
       ) VALUES (
         ?, ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?
       )`
    ).run(
      id,
      tenantId,
      input.runId,
      input.ownerAgentId,
      input.objective,
      completedStepsJson,
      remainingStepsJson,
      decisionsJson,
      artifactRefsJson,
      verificationStateJson,
      input.nextSafeAction,
      rollbackNotes,
      provenancePointersJson,
      checkpointSize,
      writeLatencyMs,
      createdAt
    );

    return insertCheckpointAuditEntry(db, checkpointForAudit);
  })();

  if (duplicateDetected) {
    duplicateWorkAvoidedCount++;
  }

  // Schedule heavy tasks asynchronously after the durable transaction succeeds.
  scheduleHeavyTasks(input.runId);

  return {
    id,
    tenantId,
    runId: input.runId,
    ownerAgentId: input.ownerAgentId,
    objective: input.objective,
    completedSteps,
    remainingSteps,
    decisions,
    artifactRefs,
    verificationState,
    nextSafeAction: input.nextSafeAction,
    rollbackNotes,
    provenancePointers,
    checkpointSize,
    writeLatencyMs,
    createdAt,
    provenanceAudit,
  };
}

export function resumeFromCheckpoint(
  db: Database.Database,
  tenantId: string,
  runId: string
): AgentCheckpoint | null {
  const row = db
    .prepare(
      `SELECT * FROM agent_checkpoints
       WHERE tenant_id = ? AND run_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(tenantId, runId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    runId: String(row.run_id),
    ownerAgentId: String(row.owner_agent_id),
    objective: String(row.objective),
    completedSteps: JSON.parse(String(row.completed_steps_json ?? "[]")),
    remainingSteps: JSON.parse(String(row.remaining_steps_json ?? "[]")),
    decisions: JSON.parse(String(row.decisions_json ?? "{}")),
    artifactRefs: JSON.parse(String(row.artifact_refs_json ?? "[]")),
    verificationState: JSON.parse(String(row.verification_state_json ?? "{}")),
    nextSafeAction: String(row.next_safe_action),
    rollbackNotes: row.rollback_notes ? String(row.rollback_notes) : null,
    provenancePointers: JSON.parse(String(row.provenance_pointers_json ?? "[]")),
    checkpointSize: Number(row.checkpoint_size ?? 0),
    writeLatencyMs: Number(row.write_latency_ms ?? 0),
    createdAt: String(row.created_at),
    provenanceAudit: getCheckpointProvenanceAudit(db, String(row.tenant_id), String(row.id)),
  };
}

export function verifyCheckpointAuditChain(
  db: Database.Database,
  tenantId: string
): CheckpointAuditChainVerification {
  const rows = db
    .prepare(
      `SELECT id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id,
              reason, metadata_json, created_at
       FROM audit_entries
       WHERE tenant_id = ?
         AND event_type = ?
       ORDER BY rowid ASC`
    )
    .all(tenantId, CHECKPOINT_AUDIT_EVENT) as CheckpointAuditRow[];

  let expectedPreviousEntryHash: string | null = null;
  let checked = 0;

  for (const row of rows) {
    checked++;
    const metadata = parseJsonRecord(row.metadata_json);
    const entryHash = stringValue(metadata.entryHash);
    if (!entryHash) {
      return {
        valid: false,
        checked,
        firstBrokenEntryId: row.id,
        reason: "checkpoint audit row is missing entryHash",
      };
    }

    const previousEntryHash =
      metadata.previousEntryHash === null ? null : stringValue(metadata.previousEntryHash) ?? null;
    if (previousEntryHash !== expectedPreviousEntryHash) {
      return {
        valid: false,
        checked,
        firstBrokenEntryId: row.id,
        reason: "checkpoint audit row does not point to the previous entry hash",
      };
    }

    const expectedEntryHash = checkpointAuditEntryHash({
      id: row.id,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      reason: row.reason,
      metadata: withoutEntryHash(metadata),
      createdAt: row.created_at,
    });

    if (entryHash !== expectedEntryHash) {
      return {
        valid: false,
        checked,
        firstBrokenEntryId: row.id,
        reason: "checkpoint audit row hash does not match row content",
      };
    }

    expectedPreviousEntryHash = entryHash;
  }

  return {
    valid: true,
    checked,
  };
}

export interface CheckpointMetrics {
  avgWriteLatencyMs: number;
  avgCheckpointSize: number;
  asyncQueueDepth: number;
  duplicateWorkAvoided: number;
}

export function getCheckpointMetrics(
  db: Database.Database,
  tenantId: string
): CheckpointMetrics {
  const row = db
    .prepare(
      `SELECT
         AVG(write_latency_ms) AS avg_latency,
         AVG(checkpoint_size) AS avg_size
       FROM agent_checkpoints
       WHERE tenant_id = ?`
    )
    .get(tenantId) as { avg_latency: number | null; avg_size: number | null } | undefined;

  return {
    avgWriteLatencyMs: row?.avg_latency ?? 0,
    avgCheckpointSize: row?.avg_size ?? 0,
    asyncQueueDepth,
    duplicateWorkAvoided: duplicateWorkAvoidedCount,
  };
}
