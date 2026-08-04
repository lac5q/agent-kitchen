import crypto from "crypto";

import { MEM0_URL } from "@/lib/constants";
import { recordEfficiencyEvent } from "@/lib/efficiency-telemetry";
import { getDb } from "@/lib/db";
import { readVaultArtifactForTenant, writeVaultArtifactWithDurability } from "@/lib/memory/vault-durability";
import { ensureMemorySalience } from "@/lib/memory/salience";
import type { SaveQualityReport } from "@/lib/memory/save-quality";
import { systemGovernance, type GovernanceContext } from "@/lib/store/governance";
import {
  createMemoryCandidate,
  createMemoryEnrichmentCapture,
  findMemoryCandidateByCaptureHash,
  getMemoryEnrichmentCapture,
  getMemoryWriteResult,
  listMemoryEnrichmentCaptures,
  updateMemoryEnrichmentCapture,
  updateMemoryWriteResult,
  withMemoryEnrichmentTransaction,
  type MemoryDatabase,
} from "@/lib/store/memory";

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 1000;

interface JsonRecord {
  [key: string]: unknown;
}

export interface CaptureMemoryBronzeInput {
  tenantId?: string;
  agentId: string;
  tier: string;
  content: string;
  metadata: Record<string, unknown>;
  storagePayload: Record<string, unknown>;
  qualityReport: SaveQualityReport;
  project?: string | null;
  now?: Date;
}

export interface CapturedMemoryBronze {
  captureId: string;
  tenantId: string;
  artifactId: string;
  artifactUri: string;
  durabilityId: string;
  contentHash: string;
  capturedAt: string;
  queueDepth: number;
}

export interface EnrichmentRunSummary {
  processed: number;
  completed: number;
  retried: number;
  candidatesCreated: number;
  extractionLagMs: number | null;
  queueDepth: number;
  errors: string[];
}

interface CaptureRow {
  id: string;
  tenant_id: string;
  source_agent_id: string;
  raw_artifact_id: string | null;
  captured_at: string;
  metadata_json: string;
  updated_at: string;
}

interface CaptureMetadata extends JsonRecord {
  enrichmentKind?: string;
  enrichmentStatus?: "pending" | "running" | "completed" | "retrying";
  attemptCount?: number;
  availableAt?: string;
  lockedAt?: string | null;
  memoryWriteId?: number;
  tier?: string;
  dedupHash?: string;
  firstSeenAt?: string;
  qualityReport?: SaveQualityReport;
  lastError?: string;
  candidateIds?: string[];
  completedAt?: string;
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function parseJsonRecord(value: string | null | undefined): JsonRecord {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function safeProject(metadata: Record<string, unknown>, fallback?: string | null): string | null {
  for (const key of ["project", "repo", "projectId", "project_id"]) {
    if (typeof metadata[key] === "string" && metadata[key].trim()) return metadata[key].trim();
  }
  return fallback?.trim() || null;
}

function captureRows(db: MemoryDatabase): CaptureRow[] {
  return listMemoryEnrichmentCaptures(db);
}

export function governedMemoryQueueDepth(db: MemoryDatabase): number {
  return captureRows(db).filter((row) => {
    const metadata = parseJsonRecord(row.metadata_json) as CaptureMetadata;
    return metadata.enrichmentStatus === "pending" || metadata.enrichmentStatus === "running" || metadata.enrichmentStatus === "retrying";
  }).length;
}

function updateCaptureMetadata(
  db: MemoryDatabase,
  captureId: string,
  metadata: CaptureMetadata,
  governance: GovernanceContext,
  status: "captured" | "handoff_ready" = "captured",
  updatedAt = nowIso()
): void {
  updateMemoryEnrichmentCapture(
    db,
    { captureId, metadataJson: JSON.stringify(metadata), status, updatedAt },
    governance,
  );
}

/**
 * Synchronously captures a governed write as a durable bronze artifact and a
 * durable session-capture queue item. No downstream memory service is called.
 */
export function captureMemoryBronze(
  db: MemoryDatabase,
  input: CaptureMemoryBronzeInput
): CapturedMemoryBronze {
  const tenantId = input.tenantId ?? "default-tenant";
  const capturedAt = nowIso(input.now);
  const captureId = crypto.randomUUID();
  const firstSeenAt = input.metadata.firstSeenAt && typeof input.metadata.firstSeenAt === "string"
    ? input.metadata.firstSeenAt
    : capturedAt;
  const dedupHash = input.metadata.dedupHash && typeof input.metadata.dedupHash === "string"
    ? input.metadata.dedupHash
    : `sha256:${sha256(input.content)}`;
  const rawBody = `${JSON.stringify({
    schema: "memroos.governed_memory_bronze.v1",
    capturedAt,
    agentId: input.agentId,
    tier: input.tier,
    content: input.content,
    metadata: input.metadata,
    storagePayload: input.storagePayload,
  })}\n`;
  const rawArtifact = writeVaultArtifactWithDurability(db, {
    tenantId,
    sourceType: "governed_memory_save",
    sourceId: input.agentId,
    sessionId: `memory-save:${captureId}`,
    project: safeProject(input.metadata, input.project),
    body: rawBody,
    actorId: input.agentId,
    replayMetadata: {
      adapter: "governed-memory-save",
      captureId,
      tier: input.tier,
      dedupHash,
    },
    label: {
      visibility: "private",
      policy: "agent_visible",
    },
    now: input.now,
  });

  const metadata: CaptureMetadata = {
    source: input.metadata.source ?? "governed-memory-save",
    enrichmentKind: "governed-memory",
    enrichmentStatus: "pending",
    attemptCount: 0,
    availableAt: capturedAt,
    lockedAt: null,
    memoryTier: input.tier,
    tier: input.tier,
    dedupHash,
    firstSeenAt,
    qualityReport: input.qualityReport,
    storagePayload: input.storagePayload,
  };
  createMemoryEnrichmentCapture(
    db,
    {
      id: captureId,
      tenantId,
      sourceAgentId: input.agentId,
      project: safeProject(input.metadata, input.project),
      sessionId: `memory-save:${captureId}`,
      summary: "Governed memory bronze capture",
      metadataJson: JSON.stringify(metadata),
      rawArtifactId: rawArtifact.id,
      captureHash: rawArtifact.contentHash,
      capturedAt,
      updatedAt: capturedAt,
    },
    systemGovernance(
      "memory.enrichment.capture",
      `agent_session_captures/${captureId}`,
      "persist governed memory bronze capture",
    ),
  );

  return {
    captureId,
    tenantId,
    artifactId: rawArtifact.id,
    artifactUri: rawArtifact.artifactUri,
    durabilityId: rawArtifact.durabilityId,
    contentHash: rawArtifact.contentHash,
    capturedAt,
    queueDepth: governedMemoryQueueDepth(db),
  };
}

export function attachMemoryWriteId(
  db: MemoryDatabase,
  captureId: string,
  writeId: number,
  queueDepth: number
): void {
  const row = getMemoryEnrichmentCapture(db, captureId);
  if (!row) return;
  const metadata = parseJsonRecord(row.metadata_json) as CaptureMetadata;
  metadata.memoryWriteId = writeId;
  metadata.queueDepthAtCapture = queueDepth;
  updateCaptureMetadata(
    db,
    captureId,
    metadata,
    systemGovernance(
      "memory.enrichment.attach_write",
      `agent_session_captures/${captureId}`,
      "attach the persisted memory write to its bronze capture",
    ),
  );
}

function memoryEnrichmentTimeoutMs(): number {
  const parsed = Number(process.env.MEMROOS_MEMORY_ENRICHMENT_TIMEOUT_MS ?? 180_000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 180_000;
}

function memoryEnrichmentLeaseMs(): number {
  const parsed = Number(process.env.MEMROOS_MEMORY_ENRICHMENT_LEASE_MS ?? DEFAULT_LEASE_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_LEASE_MS;
}

function memoryEnrichmentBatchSize(): number {
  const parsed = Number(process.env.MEMROOS_MEMORY_ENRICHMENT_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(50, Math.trunc(parsed)) : DEFAULT_BATCH_SIZE;
}

function isClaimAvailable(metadata: CaptureMetadata, now: Date): boolean {
  if (metadata.enrichmentStatus === "pending" || metadata.enrichmentStatus === "retrying") {
    return !metadata.availableAt || Date.parse(metadata.availableAt) <= now.getTime();
  }
  if (metadata.enrichmentStatus === "running") {
    return !metadata.lockedAt || Date.parse(metadata.lockedAt) + memoryEnrichmentLeaseMs() <= now.getTime();
  }
  return false;
}

function claimCapture(db: MemoryDatabase, row: CaptureRow, now: Date): { row: CaptureRow; metadata: CaptureMetadata } | null {
  const governance = systemGovernance(
    "memory.enrichment.claim",
    `agent_session_captures/${row.id}`,
    "claim a governed-memory enrichment capture",
  );
  return withMemoryEnrichmentTransaction(db, governance, () => {
    const fresh = getMemoryEnrichmentCapture(db, row.id) as CaptureRow | undefined;
    if (!fresh) return null;
    const metadata = parseJsonRecord(fresh.metadata_json) as CaptureMetadata;
    if (!isClaimAvailable(metadata, now)) return null;
    const claimed: CaptureMetadata = {
      ...metadata,
      enrichmentStatus: "running",
      lockedAt: nowIso(now),
      attemptCount: Math.max(0, Number(metadata.attemptCount ?? 0)) + 1,
      lastAttemptAt: nowIso(now),
    };
    updateCaptureMetadata(db, fresh.id, claimed, governance, "captured", nowIso(now));
    return { row: fresh, metadata: claimed };
  });
}

class RetryableEnrichmentError extends Error {}

async function callMem0(storagePayload: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${MEM0_URL}/memory/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storagePayload),
      signal: AbortSignal.timeout(memoryEnrichmentTimeoutMs()),
    });
  } catch (error) {
    throw new RetryableEnrichmentError(error instanceof Error ? error.message : String(error));
  }
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RetryableEnrichmentError(`mem0_http_${response.status}`);
  if (result.status === "queued" || result.queued === true || result.accepted === false) {
    throw new RetryableEnrichmentError("mem0_queue_acceptance_not_enrichment");
  }
  return result;
}

function extractedTexts(result: Record<string, unknown>, fallback: string): string[] {
  const values: unknown[] = [];
  for (const key of ["memories", "results", "data", "result", "facts"]) {
    const value = result[key];
    if (Array.isArray(value)) values.push(...value);
    else if (typeof value === "string") values.push(value);
  }
  const texts = values.flatMap((value) => {
    if (typeof value === "string") return [value.trim()];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      for (const key of ["memory", "text", "content", "fact"]) {
        if (typeof record[key] === "string" && record[key].trim()) return [record[key].trim()];
      }
    }
    return [];
  }).filter(Boolean);
  return Array.from(new Set(texts.length > 0 ? texts : [fallback.trim()]));
}

function candidateType(content: string, metadata: CaptureMetadata): "decision_intent" | "task_state" | "lesson" | "runbook" | "source_pointer" | "verification" {
  const lower = content.toLowerCase();
  if (metadata.qualityReport?.flags.includes("procedure_belongs_in_skill") || /\b(?:procedure|runbook|steps?)\b/.test(lower)) return "runbook";
  if (/\b(?:decision|decided|chose|outcome|because|led to)\b/.test(lower)) return "decision_intent";
  if (/\b(?:fixed|failure|failed|lesson|learned|error)\b/.test(lower)) return "lesson";
  if (/\b(?:verify|verified|passed|test|validation)\b/.test(lower)) return "verification";
  if (/https?:\/\//.test(content) || /\bsource\b/.test(lower)) return "source_pointer";
  return "task_state";
}

function updateWriteResult(
  db: MemoryDatabase,
  writeId: number | undefined,
  enrichment: Record<string, unknown>,
  governance: GovernanceContext,
): void {
  if (!writeId) return;
  const row = getMemoryWriteResult(db, writeId);
  if (!row) return;
  const result = parseJsonRecord(row.result);
  result.enrichment = { ...(result.enrichment && typeof result.enrichment === "object" ? result.enrichment as Record<string, unknown> : {}), ...enrichment };
  updateMemoryWriteResult(db, writeId, JSON.stringify(result), governance);
}

async function enrichCapture(
  db: MemoryDatabase,
  capture: { row: CaptureRow; metadata: CaptureMetadata },
  now: Date
): Promise<{ candidateIds: string[]; lagMs: number }> {
  if (!capture.row.raw_artifact_id) throw new RetryableEnrichmentError("bronze_artifact_missing");
  const artifact = readVaultArtifactForTenant(db, capture.row.tenant_id, capture.row.raw_artifact_id);
  const body = JSON.parse(artifact.body) as JsonRecord;
  const storagePayload = body.storagePayload && typeof body.storagePayload === "object" && !Array.isArray(body.storagePayload)
    ? body.storagePayload as Record<string, unknown>
    : {};
  const content = typeof body.content === "string" ? body.content : typeof storagePayload.text === "string" ? storagePayload.text : "";
  const result = await callMem0(storagePayload);
  const texts = extractedTexts(result, content);
  const candidateIds: string[] = [];
  const governance = systemGovernance(
    "memory.enrichment.complete",
    `agent_session_captures/${capture.row.id}`,
    "persist extracted memory candidates and complete enrichment",
  );
  withMemoryEnrichmentTransaction(db, governance, () => {
    for (const candidateContent of texts) {
      if (!candidateContent) continue;
      const contentHash = sha256(candidateContent);
      const candidateId = crypto.randomUUID();
      const metadata = {
        ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {}),
        source: "governed_memory_save",
        derivedFrom: capture.row.raw_artifact_id,
        extractor: "mem0-worker",
        extractionResultHash: sha256(JSON.stringify(result)),
        qualityReport: capture.metadata.qualityReport ?? null,
      };
      const insertedChanges = createMemoryCandidate(
        db,
        {
          id: candidateId,
          tenantId: capture.row.tenant_id,
          captureId: capture.row.id,
          agentId: capture.row.source_agent_id,
          memoryType: candidateType(candidateContent, capture.metadata),
          content: candidateContent,
          contentHash,
          metadataJson: JSON.stringify(metadata),
        },
        governance,
      );
      if (insertedChanges > 0) {
        candidateIds.push(candidateId);
        ensureMemorySalience(db, "agent_memory_candidate", candidateId, capture.metadata.qualityReport?.score ?? 1);
      } else {
        const existing = findMemoryCandidateByCaptureHash(db, capture.row.id, contentHash);
        if (existing) candidateIds.push(existing.id);
      }
    }
    const completed: CaptureMetadata = {
      ...capture.metadata,
      enrichmentStatus: "completed",
      lockedAt: null,
      candidateIds,
      completedAt: nowIso(now),
      lastError: undefined,
    };
    updateCaptureMetadata(db, capture.row.id, completed, governance, "handoff_ready", nowIso(now));
    updateWriteResult(db, capture.metadata.memoryWriteId, {
      status: "completed",
      completedAt: nowIso(now),
      candidateIds,
    }, governance);
  });
  return { candidateIds, lagMs: Math.max(0, now.getTime() - Date.parse(capture.row.captured_at)) };
}

function retryCapture(db: MemoryDatabase, capture: { row: CaptureRow; metadata: CaptureMetadata }, error: unknown, now: Date): void {
  const attempt = Math.max(1, Number(capture.metadata.attemptCount ?? 1));
  const backoffMs = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(attempt - 1, 8));
  const message = error instanceof Error ? error.message : String(error);
  const governance = systemGovernance(
    "memory.enrichment.retry",
    `agent_session_captures/${capture.row.id}`,
    "record a retry for governed-memory enrichment",
  );
  updateCaptureMetadata(db, capture.row.id, {
    ...capture.metadata,
    enrichmentStatus: "retrying",
    lockedAt: null,
    availableAt: new Date(now.getTime() + backoffMs).toISOString(),
    lastError: message.slice(0, 500),
  }, governance, "captured", nowIso(now));
  updateWriteResult(db, capture.metadata.memoryWriteId, {
    status: "retrying",
    attempt,
    lastError: message.slice(0, 200),
  }, governance);
}

export async function runMemoryEnrichmentWorker(options: {
  db?: MemoryDatabase;
  now?: Date;
  maxBatch?: number;
} = {}): Promise<EnrichmentRunSummary> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const summary: EnrichmentRunSummary = {
    processed: 0,
    completed: 0,
    retried: 0,
    candidatesCreated: 0,
    extractionLagMs: null,
    queueDepth: governedMemoryQueueDepth(db),
    errors: [],
  };
  for (const row of captureRows(db).slice(0, options.maxBatch ?? memoryEnrichmentBatchSize())) {
    const claimed = claimCapture(db, row, now);
    if (!claimed) continue;
    summary.processed += 1;
    try {
      const enriched = await enrichCapture(db, claimed, now);
      summary.completed += 1;
      summary.candidatesCreated += enriched.candidateIds.length;
      summary.extractionLagMs = summary.extractionLagMs === null ? enriched.lagMs : Math.max(summary.extractionLagMs, enriched.lagMs);
      recordEfficiencyEvent(db, {
        eventType: "memory_write",
        agentId: row.source_agent_id,
        payload: {
          source: "governed_memory_enrichment",
          firstSeenAt: claimed.metadata.firstSeenAt ?? row.captured_at,
          dedupHash: claimed.metadata.dedupHash ?? `sha256:${sha256(row.id)}`,
          isRediscovery: false,
          phase: "enrichment",
          enrichmentStatus: "completed",
          queueDepth: governedMemoryQueueDepth(db),
          extractionLagMs: enriched.lagMs,
          qualityScore: claimed.metadata.qualityReport?.score,
        },
      });
    } catch (error) {
      summary.retried += 1;
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${row.id}:${message}`);
      retryCapture(db, claimed, error, now);
      recordEfficiencyEvent(db, {
        eventType: "memory_write",
        agentId: row.source_agent_id,
        payload: {
          source: "governed_memory_enrichment",
          firstSeenAt: claimed.metadata.firstSeenAt ?? row.captured_at,
          dedupHash: claimed.metadata.dedupHash ?? `sha256:${sha256(row.id)}`,
          isRediscovery: false,
          phase: "enrichment",
          enrichmentStatus: "retrying",
          queueDepth: governedMemoryQueueDepth(db),
          extractionLagMs: null,
          qualityScore: claimed.metadata.qualityReport?.score,
        },
      });
    }
  }
  summary.queueDepth = governedMemoryQueueDepth(db);
  return summary;
}

let enrichmentInterval: ReturnType<typeof setInterval> | null = null;

export function startMemoryEnrichmentScheduler(): void {
  if (enrichmentInterval) return;
  const intervalMs = Number(process.env.MEMROOS_MEMORY_ENRICHMENT_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  enrichmentInterval = setInterval(() => {
    void runMemoryEnrichmentWorker();
  }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS);
  void runMemoryEnrichmentWorker();
  console.log(`[memory-enrichment] scheduler started (interval: ${intervalMs}ms)`);
}

export function stopMemoryEnrichmentSchedulerForTest(): void {
  if (enrichmentInterval) clearInterval(enrichmentInterval);
  enrichmentInterval = null;
}
