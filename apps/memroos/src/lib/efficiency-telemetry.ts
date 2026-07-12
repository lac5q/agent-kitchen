import type Database from "better-sqlite3";
import type { MemoryRecallTier, MemoryRecallTiming } from "@/lib/memory-recall-evals";
import type {
  BeliefStage,
  IgnoredRecollectionCandidate,
  RecollectionDecisionKind,
  RecollectionReason,
  RecollectionReliance,
} from "@/lib/recollection-policy";

export const EFFICIENCY_EVENT_TYPES = [
  "retrieval_trace",
  "source_read",
  "token_ledger",
  "operator_question",
  "memory_write",
] as const;

export type EfficiencyEventType = (typeof EFFICIENCY_EVENT_TYPES)[number];

export interface RetrievalTracePayload {
  query: string;
  sources: string[];
  tokensUsed: number;
  usedInFirstResponse: boolean;
  timingGate: "before_plan" | "before_tool" | "before_final";
  recollectionDecision?: RecollectionDecisionKind;
  recollectionReasons?: RecollectionReason[];
  recollectionSkipReason?: string | null;
  recollectionInjected?: Array<{
    id: string;
    tier: MemoryRecallTier;
    beliefStage: BeliefStage;
    reliance: RecollectionReliance;
    score: number;
  }>;
  recollectionIgnored?: Array<{
    id: string;
    reason: IgnoredRecollectionCandidate["reason"];
    score: number;
  }>;
  beliefStageCounts?: Record<BeliefStage, number>;
  recollectionTiming?: MemoryRecallTiming;
  ontology?: {
    ontologyId: string;
    ontologyVersion: string;
    ontologyContentHash: string;
    namespace: string;
    canonicalId: string;
    aliasMigrationPath: unknown[];
  };
}

export interface SourceReadPayload {
  sourceId: string;
  sourceHash: string;
  toolId: string;
}

export interface TokenLedgerPayload {
  rawContextTokens: number;
  cachedTokens: number;
  totalTokens: number;
  modelId: string;
}

export interface OperatorQuestionPayload {
  questionText: string;
  memoryHits: string[];
  priorAnswerMatch: boolean;
}

export interface MemoryWritePayload {
  source: string;
  firstSeenAt: string;
  dedupHash: string;
  isRediscovery: boolean;
}

export type EfficiencyPayloadByType = {
  retrieval_trace: RetrievalTracePayload;
  source_read: SourceReadPayload;
  token_ledger: TokenLedgerPayload;
  operator_question: OperatorQuestionPayload;
  memory_write: MemoryWritePayload;
};

export type EfficiencyEventPayload<T extends EfficiencyEventType = EfficiencyEventType> =
  EfficiencyPayloadByType[T];

export interface EfficiencyEventInput<T extends EfficiencyEventType = EfficiencyEventType> {
  tenantId?: string;
  eventType: T;
  taskId?: string | null;
  agentId?: string | null;
  payload: EfficiencyEventPayload<T>;
  createdAt?: string;
}

export interface EfficiencyEvent<T extends EfficiencyEventType = EfficiencyEventType> {
  id: number;
  tenantId: string;
  eventType: T;
  taskId: string | null;
  agentId: string | null;
  payload: EfficiencyEventPayload<T>;
  createdAt: string;
}

export interface EfficiencyEventQuery {
  tenantId?: string;
  eventType?: EfficiencyEventType;
  taskId?: string;
  since?: string;
  limit?: number;
}

interface EfficiencyEventRow {
  id: number;
  tenant_id: string;
  event_type: EfficiencyEventType;
  task_id: string | null;
  agent_id: string | null;
  payload: string;
  created_at: string;
}

function isEfficiencyEventType(value: unknown): value is EfficiencyEventType {
  return typeof value === "string" && EFFICIENCY_EVENT_TYPES.includes(value as EfficiencyEventType);
}

function assertEfficiencyEventType(value: unknown): asserts value is EfficiencyEventType {
  if (!isEfficiencyEventType(value)) {
    throw new Error(`Invalid efficiency event type: ${String(value)}`);
  }
}

function parsePayload<T extends EfficiencyEventType>(
  eventType: T,
  raw: string
): EfficiencyPayloadByType[T] {
  try {
    return JSON.parse(raw) as EfficiencyPayloadByType[T];
  } catch {
    throw new Error(`Invalid efficiency event payload JSON for ${eventType}`);
  }
}

function rowToEvent<T extends EfficiencyEventType = EfficiencyEventType>(
  row: EfficiencyEventRow
): EfficiencyEvent<T> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    eventType: row.event_type as T,
    taskId: row.task_id,
    agentId: row.agent_id,
    payload: parsePayload(row.event_type, row.payload) as EfficiencyPayloadByType[T],
    createdAt: row.created_at,
  };
}

function safeLimit(limit: number | undefined): number {
  return Math.min(500, Math.max(1, Math.trunc(limit ?? 100)));
}

function normalizeCreatedAt(value: string): string {
  return value.replace(/\.\d{3}Z$/, "Z");
}

function nowIsoSeconds(): string {
  return normalizeCreatedAt(new Date().toISOString());
}

export function recordEfficiencyEvent<T extends EfficiencyEventType>(
  db: Database.Database,
  input: EfficiencyEventInput<T>
): EfficiencyEvent<T> {
  assertEfficiencyEventType(input.eventType);
  const tenantId = input.tenantId ?? "default-tenant";
  const createdAt = input.createdAt ? normalizeCreatedAt(input.createdAt) : nowIsoSeconds();

  const result = db
    .prepare(
      `INSERT INTO efficiency_events (
         tenant_id, event_type, task_id, agent_id, payload, created_at
       ) VALUES (
         @tenantId, @eventType, @taskId, @agentId, @payload, @createdAt
       )`
    )
    .run({
      tenantId,
      eventType: input.eventType,
      taskId: input.taskId ?? null,
      agentId: input.agentId ?? null,
      payload: JSON.stringify(input.payload),
      createdAt,
    });

  const row = db
    .prepare("SELECT * FROM efficiency_events WHERE id = ?")
    .get(result.lastInsertRowid) as EfficiencyEventRow;
  return rowToEvent<T>(row);
}

export function listEfficiencyEvents(
  db: Database.Database,
  query: EfficiencyEventQuery = {}
): EfficiencyEvent[] {
  if (query.eventType) assertEfficiencyEventType(query.eventType);

  const where: string[] = ["tenant_id = @tenantId"];
  const params: Record<string, unknown> = {
    tenantId: query.tenantId ?? "default-tenant",
    limit: safeLimit(query.limit),
  };

  if (query.eventType) {
    where.push("event_type = @eventType");
    params.eventType = query.eventType;
  }
  if (query.taskId) {
    where.push("task_id = @taskId");
    params.taskId = query.taskId;
  }
  if (query.since) {
    where.push("created_at >= @since");
    params.since = query.since;
  }

  const rows = db
    .prepare(
      `SELECT *
       FROM efficiency_events
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT @limit`
    )
    .all(params) as EfficiencyEventRow[];

  return rows.map(rowToEvent);
}
