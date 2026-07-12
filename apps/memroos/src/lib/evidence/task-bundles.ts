import { randomUUID } from "crypto";
import type Database from "better-sqlite3";

import {
  applyOutboundPolicyToMemoryItems,
  type FilteredOutboundItem,
  type OutboundMemoryItem,
  type OutboundPolicy,
  type OutboundReceipt,
} from "../belief/outbound-policy-wiring";
import { loadOutboundPolicy } from "../belief/outbound-policy";

type JsonList = Array<Record<string, unknown> | string>;

export interface TaskBundleOutboundTelemetry {
  receipts: OutboundReceipt[];
  /** The filtered items that passed the policy and can leave the trust boundary. */
  emittedMemories: FilteredOutboundItem[];
  /** The filtered sources that passed. */
  emittedSources: FilteredOutboundItem[];
}

export interface TaskEvidenceBundleInput {
  id?: string;
  taskId: string;
  tenantId?: string;
  status?: "open" | "verified" | "failed" | "superseded";
  plan?: JsonList;
  context?: JsonList;
  permissions?: JsonList;
  tools?: JsonList;
  actions?: JsonList;
  verification?: JsonList;
  memories?: JsonList;
  sources?: JsonList;
  assumptions?: JsonList;
  residualRisks?: JsonList;
  replayHandle?: string | null;
  rollbackHandle?: string | null;
  orchestrationRunId?: string | null;
  orchestrationPlanHash?: string | null;
  orchestrationBundleHash?: string | null;
}

export interface TaskEvidenceBundle extends Required<Omit<TaskEvidenceBundleInput, "id">> {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function parseList(raw: unknown): JsonList {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as JsonList) : [];
  } catch {
    return [];
  }
}

function stringifyList(value: JsonList | undefined): string {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

export function upsertTaskEvidenceBundle(
  db: Database.Database,
  input: TaskEvidenceBundleInput
): TaskEvidenceBundle {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO task_evidence_bundles (
       id, task_id, tenant_id, status, plan_json, context_json, permissions_json,
       tools_json, actions_json, verification_json, memories_json, sources_json,
       assumptions_json, residual_risks_json, replay_handle, rollback_handle,
       orchestration_run_id, orchestration_plan_hash, orchestration_bundle_hash,
       created_at, updated_at
     ) VALUES (
       @id, @taskId, @tenantId, @status, @planJson, @contextJson, @permissionsJson,
       @toolsJson, @actionsJson, @verificationJson, @memoriesJson, @sourcesJson,
       @assumptionsJson, @residualRisksJson, @replayHandle, @rollbackHandle,
       @orchestrationRunId, @orchestrationPlanHash, @orchestrationBundleHash,
       @createdAt, @updatedAt
     )
     ON CONFLICT(id) DO UPDATE SET
       task_id = excluded.task_id,
       tenant_id = excluded.tenant_id,
       status = excluded.status,
       plan_json = excluded.plan_json,
       context_json = excluded.context_json,
       permissions_json = excluded.permissions_json,
       tools_json = excluded.tools_json,
       actions_json = excluded.actions_json,
       verification_json = excluded.verification_json,
       memories_json = excluded.memories_json,
       sources_json = excluded.sources_json,
       assumptions_json = excluded.assumptions_json,
       residual_risks_json = excluded.residual_risks_json,
       replay_handle = excluded.replay_handle,
       rollback_handle = excluded.rollback_handle,
       orchestration_run_id = excluded.orchestration_run_id,
       orchestration_plan_hash = excluded.orchestration_plan_hash,
       orchestration_bundle_hash = excluded.orchestration_bundle_hash,
       updated_at = excluded.updated_at`
  ).run({
    id,
    taskId: input.taskId,
    tenantId: input.tenantId ?? "default-tenant",
    status: input.status ?? "open",
    planJson: stringifyList(input.plan),
    contextJson: stringifyList(input.context),
    permissionsJson: stringifyList(input.permissions),
    toolsJson: stringifyList(input.tools),
    actionsJson: stringifyList(input.actions),
    verificationJson: stringifyList(input.verification),
    memoriesJson: stringifyList(input.memories),
    sourcesJson: stringifyList(input.sources),
    assumptionsJson: stringifyList(input.assumptions),
    residualRisksJson: stringifyList(input.residualRisks),
    replayHandle: input.replayHandle ?? null,
    rollbackHandle: input.rollbackHandle ?? null,
    orchestrationRunId: input.orchestrationRunId ?? null,
    orchestrationPlanHash: input.orchestrationPlanHash ?? null,
    orchestrationBundleHash: input.orchestrationBundleHash ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const row = db.prepare("SELECT * FROM task_evidence_bundles WHERE id = ?").get(id);
  return mapTaskEvidenceBundle(row as Record<string, unknown>);
}

export function getTaskEvidenceBundle(
  db: Database.Database,
  id: string
): TaskEvidenceBundle | null {
  const row = db.prepare("SELECT * FROM task_evidence_bundles WHERE id = ?").get(id);
  return row ? mapTaskEvidenceBundle(row as Record<string, unknown>) : null;
}

export function listTaskEvidenceBundles(
  db: Database.Database,
  taskId: string,
  limit = 20
): TaskEvidenceBundle[] {
  const rows = db
    .prepare(
      `SELECT * FROM task_evidence_bundles
       WHERE task_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(taskId, Math.min(Math.max(limit, 1), 100)) as Array<Record<string, unknown>>;
  return rows.map(mapTaskEvidenceBundle);
}

function mapTaskEvidenceBundle(row: Record<string, unknown>): TaskEvidenceBundle {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    tenantId: String(row.tenant_id ?? "default-tenant"),
    status:
      row.status === "verified" || row.status === "failed" || row.status === "superseded"
        ? row.status
        : "open",
    plan: parseList(row.plan_json),
    context: parseList(row.context_json),
    permissions: parseList(row.permissions_json),
    tools: parseList(row.tools_json),
    actions: parseList(row.actions_json),
    verification: parseList(row.verification_json),
    memories: parseList(row.memories_json),
    sources: parseList(row.sources_json),
    assumptions: parseList(row.assumptions_json),
    residualRisks: parseList(row.residual_risks_json),
    replayHandle: typeof row.replay_handle === "string" ? row.replay_handle : null,
    rollbackHandle: typeof row.rollback_handle === "string" ? row.rollback_handle : null,
    orchestrationRunId: typeof row.orchestration_run_id === "string" ? row.orchestration_run_id : null,
    orchestrationPlanHash: typeof row.orchestration_plan_hash === "string" ? row.orchestration_plan_hash : null,
    orchestrationBundleHash: typeof row.orchestration_bundle_hash === "string" ? row.orchestration_bundle_hash : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Phase 123: build the outbound view of an evidence bundle.
 *
 * The raw bundle stays as-is in storage. When something leaves the trust
 * boundary (operator console, agent outbound payload, audit feed, ...) we
 * run the memories + sources buckets through the outbound policy filter.
 * Items without `beliefStage` pass through unchanged so legacy bundles are
 * not penalized for missing metadata.
 *
 * Returns the filtered emitted items + the receipts (content-free). The
 * underlying stored bundle is untouched: callers must use this helper (not
 * the raw bundle) when shipping data outbound.
 */
export function getOutboundFilteredBundle(
  db: Database.Database,
  id: string,
  options: { policy?: OutboundPolicy; citationMode?: boolean } = {}
): { bundle: TaskEvidenceBundle; telemetry: TaskBundleOutboundTelemetry } | null {
  const bundle = getTaskEvidenceBundle(db, id);
  if (!bundle) return null;
  const policy = options.policy ?? loadOutboundPolicy();

  const memoriesAsItems: OutboundMemoryItem[] = bundle.memories
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => entry as OutboundMemoryItem);
  const sourcesAsItems: OutboundMemoryItem[] = bundle.sources
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => entry as OutboundMemoryItem);

  const memoryFilter = applyOutboundPolicyToMemoryItems(
    memoriesAsItems,
    policy,
    { citationMode: options.citationMode === true }
  );
  const sourceFilter = applyOutboundPolicyToMemoryItems(
    sourcesAsItems,
    policy,
    { citationMode: options.citationMode === true }
  );

  return {
    bundle,
    telemetry: {
      receipts: [...memoryFilter.receipts, ...sourceFilter.receipts],
      emittedMemories: memoryFilter.emitted,
      emittedSources: sourceFilter.emitted,
    },
  };
}
