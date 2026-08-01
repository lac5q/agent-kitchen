/**
 * NOC efficiency telemetry aggregation.
 *
 * Kept as a standalone module so the metrics/panel helpers remain unit-testable
 * while Operations NOC keeps EfficiencySignals known_unwired until EFFTEL
 * producers are verified end-to-end.
 */
import type { getDb } from "@/lib/db";
import {
  metricEnvelope,
  type MetricEnvelope,
  type MetricStatus,
} from "@/lib/metric-status";
import { LOCAL_NOC_AGENT_IDS, type NocWorkspace } from "@/lib/noc-filters";
import {
  EFFICIENCY_EVENT_TYPES,
  type EfficiencyEventType,
} from "@/lib/efficiency-telemetry";

export type RecollectionDecision = "search_required" | "search_skipped";
export type BeliefStage =
  | "bronze_raw_source"
  | "silver_candidate_claim"
  | "gold_operational_truth";
export type RecollectionReliance =
  | "direct_truth"
  | "caveated_claim"
  | "source_evidence_only";
export type IgnoredRecollectionReason = "policy_denied" | "below_threshold";

interface EfficiencyEventRow {
  id: number;
  event_type: EfficiencyEventType;
  task_id: string | null;
  agent_id: string | null;
  payload: string;
  created_at: string;
}

export interface EfficiencyEventForMetrics {
  id: number;
  eventType: EfficiencyEventType;
  taskId: string | null;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const EFFICIENCY_STREAM_LABELS: Record<EfficiencyEventType, string> = {
  retrieval_trace: "retrieval trace telemetry",
  source_read: "source-read telemetry",
  token_ledger: "raw-context token ledger",
  operator_question: "operator-question telemetry",
  memory_write: "memory-write telemetry",
};

export function efficiencyWorkspaceClause(workspace: NocWorkspace): string {
  const quotedIds = LOCAL_NOC_AGENT_IDS.map((agentId) => `'${agentId}'`).join(",");
  if (workspace === "local") {
    return `AND e.agent_id IN (${quotedIds})`;
  }
  if (workspace === "remote") {
    return `AND e.agent_id NOT IN (${quotedIds})`;
  }
  return "";
}

export function safeJsonPayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function numericPayloadValue(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanPayloadValue(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

function stringPayloadValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArrayPayloadValue(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objectArrayPayloadValue(
  payload: Record<string, unknown>,
  key: string
): Record<string, unknown>[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function emptyBeliefStageCounts(): Record<BeliefStage, number> {
  return {
    bronze_raw_source: 0,
    silver_candidate_claim: 0,
    gold_operational_truth: 0,
  };
}

function emptyRelianceCounts(): Record<RecollectionReliance, number> {
  return {
    direct_truth: 0,
    caveated_claim: 0,
    source_evidence_only: 0,
  };
}

function emptyRecollectionMetrics() {
  return {
    totalDecisions: 0,
    searchRequired: 0,
    searchSkipped: 0,
    injectedMemories: 0,
    ignoredCandidates: 0,
    policyDeniedCandidates: 0,
    belowThresholdCandidates: 0,
    skipReasons: {} as Record<string, number>,
    beliefStageCounts: emptyBeliefStageCounts(),
    relianceCounts: emptyRelianceCounts(),
    latestDecisions: [] as Array<{
      id: number;
      taskId: string | null;
      agentId: string | null;
      decision: RecollectionDecision;
      timing: string | null;
      reasons: string[];
      skipReason: string | null;
      createdAt: string;
    }>,
  };
}

function isRecollectionDecision(value: string | null): value is RecollectionDecision {
  return value === "search_required" || value === "search_skipped";
}

function isBeliefStage(value: unknown): value is BeliefStage {
  return (
    value === "bronze_raw_source" ||
    value === "silver_candidate_claim" ||
    value === "gold_operational_truth"
  );
}

function isReliance(value: unknown): value is RecollectionReliance {
  return value === "direct_truth" || value === "caveated_claim" || value === "source_evidence_only";
}

function isIgnoredReason(value: unknown): value is IgnoredRecollectionReason {
  return value === "policy_denied" || value === "below_threshold";
}

export function readEfficiencyEvents(
  db: ReturnType<typeof getDb>,
  since: string,
  workspace: NocWorkspace
): EfficiencyEventForMetrics[] {
  const ws = efficiencyWorkspaceClause(workspace);
  const rows = db
    .prepare(
      `SELECT id, event_type, task_id, agent_id, payload, created_at
       FROM efficiency_events e
       WHERE e.tenant_id = 'default-tenant'
         AND e.created_at >= ?
         ${ws}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 5000`
    )
    .all(since) as EfficiencyEventRow[];

  return rows.map((row): EfficiencyEventForMetrics => ({
    id: row.id,
    eventType: row.event_type,
    taskId: row.task_id,
    agentId: row.agent_id,
    payload: safeJsonPayload(row.payload),
    createdAt: row.created_at,
  }));
}

function emptyEfficiencyStreams() {
  return Object.fromEntries(EFFICIENCY_EVENT_TYPES.map((eventType) => [eventType, 0])) as Record<
    EfficiencyEventType,
    number
  >;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function computeEfficiencyMetrics(events: EfficiencyEventForMetrics[]) {
  const streams = emptyEfficiencyStreams();
  const recollection = emptyRecollectionMetrics();
  let retrievalUsedInFirstResponse = 0;
  let rawContextTokens = 0;
  let cachedTokens = 0;
  let totalTokens = 0;
  let operatorReasks = 0;
  let rediscoveredWrites = 0;
  const sourceReadGroups = new Map<string, number>();
  let lastUpdated: string | null = null;

  for (const event of events) {
    streams[event.eventType] += 1;
    if (!lastUpdated || event.createdAt > lastUpdated) {
      lastUpdated = event.createdAt;
    }

    if (event.eventType === "retrieval_trace") {
      if (booleanPayloadValue(event.payload, "usedInFirstResponse")) {
        retrievalUsedInFirstResponse += 1;
      }
      const decision = stringPayloadValue(event.payload, "recollectionDecision");
      if (isRecollectionDecision(decision)) {
        recollection.totalDecisions += 1;
        if (decision === "search_required") recollection.searchRequired += 1;
        if (decision === "search_skipped") recollection.searchSkipped += 1;

        const skipReason = stringPayloadValue(event.payload, "recollectionSkipReason");
        if (skipReason) {
          recollection.skipReasons[skipReason] = (recollection.skipReasons[skipReason] ?? 0) + 1;
        }

        if (recollection.latestDecisions.length < 5) {
          recollection.latestDecisions.push({
            id: event.id,
            taskId: event.taskId,
            agentId: event.agentId,
            decision,
            timing: stringPayloadValue(event.payload, "recollectionTiming"),
            reasons: stringArrayPayloadValue(event.payload, "recollectionReasons"),
            skipReason,
            createdAt: event.createdAt,
          });
        }
      }

      for (const item of objectArrayPayloadValue(event.payload, "recollectionInjected")) {
        recollection.injectedMemories += 1;
        if (isBeliefStage(item.beliefStage)) recollection.beliefStageCounts[item.beliefStage] += 1;
        if (isReliance(item.reliance)) recollection.relianceCounts[item.reliance] += 1;
      }

      for (const item of objectArrayPayloadValue(event.payload, "recollectionIgnored")) {
        recollection.ignoredCandidates += 1;
        if (isIgnoredReason(item.reason)) {
          if (item.reason === "policy_denied") recollection.policyDeniedCandidates += 1;
          if (item.reason === "below_threshold") recollection.belowThresholdCandidates += 1;
        }
      }
      continue;
    }

    if (event.eventType === "source_read") {
      const sourceHash = stringPayloadValue(event.payload, "sourceHash");
      if (sourceHash) {
        const taskScope = event.taskId ?? `event:${event.id}`;
        const groupKey = `${taskScope}:${sourceHash}`;
        sourceReadGroups.set(groupKey, (sourceReadGroups.get(groupKey) ?? 0) + 1);
      }
      continue;
    }

    if (event.eventType === "token_ledger") {
      rawContextTokens += numericPayloadValue(event.payload, "rawContextTokens");
      cachedTokens += numericPayloadValue(event.payload, "cachedTokens");
      totalTokens += numericPayloadValue(event.payload, "totalTokens");
      continue;
    }

    if (event.eventType === "operator_question") {
      if (booleanPayloadValue(event.payload, "priorAnswerMatch")) {
        operatorReasks += 1;
      }
      continue;
    }

    if (event.eventType === "memory_write" && booleanPayloadValue(event.payload, "isRediscovery")) {
      rediscoveredWrites += 1;
    }
  }

  const repeatedSourceReads = Array.from(sourceReadGroups.values()).reduce(
    (total, count) => total + Math.max(0, count - 1),
    0
  );

  return {
    totalEvents: events.length,
    retrievalEvents: streams.retrieval_trace,
    retrievalUsedInFirstResponse,
    retrievalBeforeWorkRate: ratio(retrievalUsedInFirstResponse, streams.retrieval_trace),
    sourceReadEvents: streams.source_read,
    repeatedSourceReads,
    tokenLedgerEvents: streams.token_ledger,
    rawContextTokens,
    cachedTokens,
    totalTokens,
    rawContextTokenShare: ratio(rawContextTokens, totalTokens),
    operatorQuestions: streams.operator_question,
    operatorReasks,
    operatorReaskRate: ratio(operatorReasks, streams.operator_question),
    memoryWrites: streams.memory_write,
    rediscoveredWrites,
    rediscoveredFactRate: ratio(rediscoveredWrites, streams.memory_write),
    recollection,
    streams,
    lastUpdated,
  };
}

export type EfficiencyMetrics = ReturnType<typeof computeEfficiencyMetrics>;

function panel(
  status: "live" | "empty" | "degraded" | "missing",
  source: string,
  lastUpdated: string | null,
  warnings: string[] = []
) {
  return { status, source, lastUpdated, warnings };
}

export function efficiencyPanelFor(metrics: EfficiencyMetrics) {
  if (metrics.totalEvents === 0) {
    return panel("empty", "efficiency_events", metrics.lastUpdated, [
      "No efficiency telemetry events in the selected window",
    ]);
  }

  const warnings = EFFICIENCY_EVENT_TYPES.filter((eventType) => metrics.streams[eventType] === 0).map(
    (eventType) => `Missing ${EFFICIENCY_STREAM_LABELS[eventType]}`
  );

  return panel(warnings.length > 0 ? "degraded" : "live", "efficiency_events", metrics.lastUpdated, warnings);
}

export function buildEfficiencyEnvelope(
  metrics: EfficiencyMetrics,
  scope: { window: string; workspace: string }
): MetricEnvelope<EfficiencyMetrics> {
  let status: MetricStatus;
  let reason: string;

  if (metrics.totalEvents === 0) {
    status = "empty";
    reason = "Healthy source has no efficiency telemetry events in the selected window";
  } else {
    const missingStreams = EFFICIENCY_EVENT_TYPES.filter((eventType) => metrics.streams[eventType] === 0);
    if (missingStreams.length > 0) {
      status = "degraded";
      reason = `Missing ${missingStreams.length}/${EFFICIENCY_EVENT_TYPES.length} efficiency streams: ${missingStreams
        .map((eventType) => EFFICIENCY_STREAM_LABELS[eventType])
        .join(", ")}`;
    } else {
      status = "live";
      reason = `All ${EFFICIENCY_EVENT_TYPES.length} efficiency streams produced events in the selected window`;
    }
  }

  return metricEnvelope({
    value: metrics,
    status,
    source: "durable://efficiency_events",
    observedAt: metrics.lastUpdated,
    freshnessMs: metrics.lastUpdated
      ? Math.max(0, Date.now() - Date.parse(metrics.lastUpdated))
      : null,
    scope,
    reason,
  });
}
