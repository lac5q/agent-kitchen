import { apiError } from "@/lib/api-error";
import { collectLocalFootprintInventory } from "@/lib/cloud-offload/footprint";
import { getDb } from "@/lib/db";
import { buildMemoryIterationSnapshot } from "@/lib/memory/doctor";
import { listSecurityAttentionAuditLog } from "@/lib/store/audit";
import {
  classifyScalar,
  metricEnvelope,
  normalizeScope,
  type MetricEnvelope,
  type MetricScope,
  type MetricStatus,
} from "@/lib/metric-status";
import {
  LOCAL_NOC_AGENT_IDS,
  normalizeNocWindow,
  normalizeNocWorkspace,
  nocWindowToSinceIso,
  type NocWorkspace,
} from "@/lib/noc-filters";
import fs from "node:fs";
import path from "node:path";
import { listDeprecatedSkills } from "@/lib/skills/skill-lifecycle";
import { evaluateContextSources, loadContextSourceContracts } from "@/lib/context-sources";

export const dynamic = "force-dynamic";

type OperatorLoadStatus = {
  status: "pass" | "fail" | "unreachable" | "baseline" | "missing";
  p95Ms: number | null;
  errorRate: number | null;
  generatedAt: string | null;
  ageHours: number | null;
  targetHost: string | null;
  endpoint: string | null;
  findings: string[];
  gitSha: string | null;
};

function readOperatorLoadReport(repoRoot: string): OperatorLoadStatus | null {
  // Phase 124 (ENTOPS-01): read the latest committed operator load
  // report without making this a hard dependency for the rest of NOC.
  // If the file is missing or unreadable, fall through to "missing".
  try {
    const reportPath = path.join(repoRoot, "reports", "operator-load", "latest.json");
    if (!fs.existsSync(reportPath)) return null;
    const raw = fs.readFileSync(reportPath, "utf8");
    const parsed = JSON.parse(raw) as {
      status?: string;
      p95Ms?: number | null;
      errorRate?: number | null;
      generatedAt?: string;
      targetHost?: string;
      endpoint?: string;
      findings?: string[];
      manifest?: { gitSha?: string };
    };
    const generatedAt = parsed.generatedAt ?? null;
    const ageHours =
      generatedAt && Number.isFinite(Date.parse(generatedAt))
        ? (Date.now() - Date.parse(generatedAt)) / (1000 * 60 * 60)
        : null;
    const rawStatus = parsed.status ?? "missing";
    const status: OperatorLoadStatus["status"] =
      rawStatus === "pass" || rawStatus === "fail" || rawStatus === "unreachable" || rawStatus === "baseline"
        ? rawStatus
        : "missing";
    return {
      status,
      p95Ms: typeof parsed.p95Ms === "number" ? parsed.p95Ms : null,
      errorRate: typeof parsed.errorRate === "number" ? parsed.errorRate : null,
      generatedAt,
      ageHours: ageHours == null ? null : Number(ageHours.toFixed(2)),
      targetHost: parsed.targetHost ?? null,
      endpoint: parsed.endpoint ?? null,
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      gitSha: parsed.manifest?.gitSha ?? null,
    };
  } catch {
    return null;
  }
}

function findRepoRoot(startDir: string): string {
  // Walk up from the Next.js app dir until we see the reports/ folder.
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "reports", "operator-load"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

type PanelStatus = "live" | "empty" | "degraded" | "missing";
type NocSourceState = "live" | "window_empty" | "no_history" | "stale_or_error" | "known_unwired";
type AttentionSeverity = "critical" | "warning" | "info";

type AttentionItem = {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string | null;
  timestamp: string | null;
  target: string | null;
};

type AttentionResult = {
  items: AttentionItem[];
  sourceState: "live" | "stale_or_error";
};

type AgentActivity = {
  sourceState: NocSourceState;
  source: string;
  observedAt: string | null;
  agents: Array<{
    agentId: string;
    messageCount: number;
    sessionCount: number;
    lastMessageAt: string;
  }>;
  delegations: Array<{
    taskId: string;
    fromAgent: string;
    toAgent: string;
    status: string;
    updatedAt: string;
  }>;
};

type EfficiencyEventType =
  | "retrieval_trace"
  | "source_read"
  | "token_ledger"
  | "operator_question"
  | "memory_write";
type RecollectionDecision = "search_required" | "search_skipped";
type BeliefStage = "bronze_raw_source" | "silver_candidate_claim" | "gold_operational_truth";
type RecollectionReliance = "direct_truth" | "caveated_claim" | "source_evidence_only";
type IgnoredRecollectionReason = "policy_denied" | "below_threshold";

interface EfficiencyEventRow {
  id: number;
  event_type: EfficiencyEventType;
  task_id: string | null;
  agent_id: string | null;
  payload: string;
  created_at: string;
}

interface EfficiencyEventForMetrics {
  id: number;
  eventType: EfficiencyEventType;
  taskId: string | null;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const EFFICIENCY_EVENT_TYPES: EfficiencyEventType[] = [
  "retrieval_trace",
  "source_read",
  "token_ledger",
  "operator_question",
  "memory_write",
];

const EFFICIENCY_STREAM_LABELS: Record<EfficiencyEventType, string> = {
  retrieval_trace: "retrieval trace telemetry",
  source_read: "source-read telemetry",
  token_ledger: "raw-context token ledger",
  operator_question: "operator-question telemetry",
  memory_write: "memory-write telemetry",
};

function safeScalar(
  db: ReturnType<typeof getDb>,
  sql: string,
  params: unknown[] = []
): { ok: boolean; value: number; error: string | null } {
  try {
    const row = db.prepare(sql).get(...params) as { value?: number | null } | undefined;
    return { ok: true, value: Number(row?.value ?? 0), error: null };
  } catch (error) {
    return {
      ok: false,
      value: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function safeLatest(
  db: ReturnType<typeof getDb>,
  sql: string,
  params: unknown[] = []
): { ok: boolean; latestAt: string | null; error: string | null } {
  try {
    const row = db.prepare(sql).get(...params) as { value?: string | null } | undefined;
    return {
      ok: true,
      latestAt: typeof row?.value === "string" ? row.value : null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      latestAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


function envelopeFromScalar(
  result: { ok: boolean; value: number; error: string | null },
  source: string,
  scope: MetricScope,
  options: { latestAt: string | null; freshnessMs?: number | null; reason?: string } = { latestAt: null }
): MetricEnvelope<number> {
  const classification = classifyScalar({
    rowCount: result.value,
    sourceOk: result.ok,
    latestAt: options.latestAt,
    freshnessMs: options.freshnessMs ?? null,
  });
  // Caller-supplied reasons (e.g. cumulative-scope disclosures) win over
  // the generic classification reason so the envelope can advertise its
  // actual semantics regardless of the row count.
  return metricEnvelope({
    value: result.ok ? result.value : null,
    status: classification.status,
    source,
    observedAt: options.latestAt,
    freshnessMs: classification.freshnessMs,
    scope,
    reason: !result.ok
      ? result.error ?? classification.reason
      : options.reason ?? classification.reason,
  });
}
function workspaceClause(workspace: NocWorkspace) {
  if (workspace === "local") {
    return "AND m.agent_id IN ('codex','claude','claude-code','gemini','hermes','memroos','openclaw','qwen')";
  }
  if (workspace === "remote") {
    return "AND m.agent_id NOT IN ('codex','claude','claude-code','gemini','hermes','memroos','openclaw','qwen')";
  }
  return "";
}

function efficiencyWorkspaceClause(workspace: NocWorkspace) {
  const quotedIds = LOCAL_NOC_AGENT_IDS.map((agentId) => `'${agentId}'`).join(",");
  if (workspace === "local") {
    return `AND e.agent_id IN (${quotedIds})`;
  }
  if (workspace === "remote") {
    return `AND e.agent_id NOT IN (${quotedIds})`;
  }
  return "";
}

function hiveActionsWorkspaceClause(workspace: NocWorkspace) {
  const quotedIds = LOCAL_NOC_AGENT_IDS.map((agentId) => `'${agentId}'`).join(",");
  if (workspace === "local") {
    return `AND a.agent_id IN (${quotedIds})`;
  }
  if (workspace === "remote") {
    return `AND a.agent_id NOT IN (${quotedIds})`;
  }
  return "";
}

function delegationWorkspaceClause(workspace: NocWorkspace) {
  const quotedIds = LOCAL_NOC_AGENT_IDS.map((agentId) => `'${agentId}'`).join(",");
  if (workspace === "local") {
    return `AND (d.from_agent IN (${quotedIds}) OR d.to_agent IN (${quotedIds}))`;
  }
  if (workspace === "remote") {
    return `AND (d.from_agent NOT IN (${quotedIds}) OR d.to_agent NOT IN (${quotedIds}))`;
  }
  return "";
}

function readAgentActivity(db: ReturnType<typeof getDb>, since: string, workspace: NocWorkspace): AgentActivity {
  const ws = workspaceClause(workspace);
  try {
    const agents = db.prepare(
      `SELECT m.agent_id AS agentId,
              COUNT(*) AS messageCount,
              COUNT(DISTINCT m.session_id) AS sessionCount,
              MAX(m.timestamp) AS lastMessageAt
       FROM messages m
       WHERE m.timestamp >= ? ${ws}
       GROUP BY m.agent_id
       ORDER BY lastMessageAt DESC, m.agent_id ASC`
    ).all(since) as Array<{
      agentId: string;
      messageCount: number;
      sessionCount: number;
      lastMessageAt: string;
    }>;
    const observedAt = agents[0]?.lastMessageAt ?? null;
    const history = agents.length === 0
      ? Number((db.prepare(`SELECT COUNT(*) AS value FROM messages m WHERE 1=1 ${ws}`).get() as { value: number }).value)
      : 0;
    const dws = delegationWorkspaceClause(workspace);
    let delegations: AgentActivity["delegations"] = [];
    try {
      delegations = db.prepare(
        `SELECT d.task_id AS taskId, d.from_agent AS fromAgent, d.to_agent AS toAgent,
                d.status AS status, d.updated_at AS updatedAt
         FROM hive_delegations d
         WHERE d.updated_at >= ? ${dws}
         ORDER BY d.updated_at DESC, d.task_id ASC
         LIMIT 25`
      ).all(since) as AgentActivity["delegations"];
    } catch {
      // Delegation detail is additive; message activity remains available.
    }
    return {
      sourceState: agents.length > 0 ? "live" : history > 0 ? "window_empty" : "no_history",
      source: "sqlite://messages",
      observedAt,
      agents,
      delegations,
    };
  } catch {
    return {
      sourceState: "stale_or_error",
      source: "sqlite://messages",
      observedAt: null,
      agents: [],
      delegations: [],
    };
  }
}

function buildAttention(db: ReturnType<typeof getDb>): AttentionResult {
  const items: AttentionItem[] = [];
  let sourceState: AttentionResult["sourceState"] = "live";
  try {
    const cronRows = db.prepare(
      `SELECT id, name, warning, last_failure_at AS lastFailureAt, updated_at AS updatedAt
       FROM cron_health_jobs
       WHERE status = 'active' AND (warning IS NOT NULL OR last_failure_at IS NOT NULL)`
    ).all() as Array<{ id: string; name: string; warning: string | null; lastFailureAt: string | null; updatedAt: string }>;
    items.push(...cronRows.map((row) => ({
      id: `cron:${row.id}`,
      severity: "critical" as const,
      title: `Cron needs attention: ${row.name}`,
      detail: row.warning,
      timestamp: row.lastFailureAt ?? row.updatedAt,
      target: null,
    })));
  } catch {
    sourceState = "stale_or_error";
  }
  try {
    const hilRows = db.prepare(
      `SELECT id, escalation_type AS escalationType, status, sla_deadline AS slaDeadline, created_at AS createdAt
       FROM hil_escalations
       WHERE status IN ('open', 'sla_breached')
       ORDER BY sla_deadline ASC
       LIMIT 25`
    ).all() as Array<{ id: string; escalationType: string; status: string; slaDeadline: string; createdAt: string }>;
    items.push(...hilRows.map((row) => ({
      id: `hil:${row.id}`,
      severity: row.status === "sla_breached" ? "critical" as const : "warning" as const,
      title: row.status === "sla_breached" ? `HIL SLA breached: ${row.escalationType}` : `Pending HIL review: ${row.escalationType}`,
      detail: null,
      timestamp: row.slaDeadline || row.createdAt,
      target: "/escalations",
    })));
  } catch {
    sourceState = "stale_or_error";
  }
  try {
    const securityRows = listSecurityAttentionAuditLog(db);
    items.push(...securityRows.map((row) => ({
      id: `security:${row.id}`,
      severity: row.severity === "high" ? "critical" as const : "warning" as const,
      title: `Security finding: ${row.action}`,
      detail: row.target,
      timestamp: row.timestamp,
      target: "/audit",
    })));
  } catch {
    sourceState = "stale_or_error";
  }
  try {
    const sources = evaluateContextSources(loadContextSourceContracts()).sources;
    items.push(...sources
      .filter((source) => source.status === "stale" || source.status === "degraded")
      .map((source) => ({
        id: `source:${source.id}`,
        severity: "info" as const,
        title: `Source freshness needs attention: ${source.id}`,
        detail: source.lastError ?? source.repairHint,
        timestamp: source.lastRun,
        target: "/library",
      })));
  } catch {
    sourceState = "stale_or_error";
  }
  const rank: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return {
    items: items.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.timestamp ?? "").localeCompare(a.timestamp ?? "") || a.id.localeCompare(b.id)),
    sourceState,
  };
}

function panel(status: PanelStatus, source: string, lastUpdated: string | null, warnings: string[] = []) {
  return { status, source, lastUpdated, warnings };
}

function safeJsonPayload(raw: string): Record<string, unknown> {
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

function objectArrayPayloadValue(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
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
  return value === "bronze_raw_source" || value === "silver_candidate_claim" || value === "gold_operational_truth";
}

function isReliance(value: unknown): value is RecollectionReliance {
  return value === "direct_truth" || value === "caveated_claim" || value === "source_evidence_only";
}

function isIgnoredReason(value: unknown): value is IgnoredRecollectionReason {
  return value === "policy_denied" || value === "below_threshold";
}

function readEfficiencyEvents(db: ReturnType<typeof getDb>, since: string, workspace: NocWorkspace) {
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

function computeEfficiencyMetrics(events: EfficiencyEventForMetrics[]) {
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

function efficiencyPanelFor(metrics: ReturnType<typeof computeEfficiencyMetrics>) {
  if (metrics.totalEvents === 0) {
    return panel("empty", "efficiency_events", metrics.lastUpdated, [
      "No efficiency telemetry events in the selected window",
    ]);
  }

  const warnings = EFFICIENCY_EVENT_TYPES.filter((eventType) => metrics.streams[eventType] === 0)
    .map((eventType) => `Missing ${EFFICIENCY_STREAM_LABELS[eventType]}`);

  return panel(warnings.length > 0 ? "degraded" : "live", "efficiency_events", metrics.lastUpdated, warnings);
}

function buildEfficiencyEnvelope(
  metrics: ReturnType<typeof computeEfficiencyMetrics>,
  scope: { window: string; workspace: string }
): MetricEnvelope<ReturnType<typeof computeEfficiencyMetrics>> {
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

function panelFromEnvelope(
  primary: MetricEnvelope<number>,
  secondary: MetricEnvelope<number> | null,
  latest: { ok: boolean; latestAt: string | null; error: string | null }
): { status: PanelStatus; source: string; lastUpdated: string | null; warnings: string[] } {
  const panelStatus: PanelStatus =
    primary.status === "live" || primary.status === "zero"
      ? primary.value && primary.value > 0
        ? "live"
        : primary.status === "zero"
          ? "empty"
          : "live"
      : primary.status === "empty"
        ? "empty"
        : primary.status === "degraded"
          ? "degraded"
          : primary.status === "error"
            ? "degraded"
            : "missing";
  const warnings: string[] = [];
  if (primary.status === "error") {
    warnings.push(primary.reason ?? "Underlying source query failed");
  }
  if (secondary && secondary.status === "error") {
    warnings.push(secondary.reason ?? "Secondary source query failed");
  }
  if (!latest.ok && latest.error) {
    warnings.push(`Latest-observation probe failed: ${latest.error}`);
  }
  const live =
    panelStatus === "live" &&
    (primary.value ?? 0) > 0 &&
    (secondary ? (secondary.value ?? 0) > 0 : true);
  return {
    status: live ? "live" : panelStatus,
    source: primary.source,
    lastUpdated: primary.observedAt,
    warnings,
  };
}

async function buildNocResponse(request: Request) {
  const url = new URL(request.url);
  const window = normalizeNocWindow(url.searchParams.get("window"));
  const workspace = normalizeNocWorkspace(url.searchParams.get("workspace"));
  const since = nocWindowToSinceIso(window);
  const scope = normalizeScope({ window, workspace }, "24h", "all");
  const db = getDb();
  const ws = workspaceClause(workspace);
  // EfficiencySignals stays known_unwired until EFFTEL producers are verified.
  // Do not include efficiency metrics/panels in the default NOC response.
  const agentActivity = readAgentActivity(db, since, workspace);
  const attention = buildAttention(db);

  const memoryRows = safeScalar(
    db,
    `SELECT COUNT(*) AS value FROM messages m WHERE m.timestamp >= ? ${ws}`,
    [since]
  );
  const activeDispatches = safeScalar(
    db,
    "SELECT COUNT(*) AS value FROM hive_delegations WHERE status IN ('pending','active','paused')"
  );
  const failedWork = safeScalar(
    db,
    "SELECT COUNT(*) AS value FROM hive_delegations WHERE status = 'failed'"
  );
  const hawkws = hiveActionsWorkspaceClause(workspace);
  const hiveActions = safeScalar(
    db,
    `SELECT COUNT(*) AS value FROM hive_actions a WHERE a.timestamp >= ? ${hawkws}`,
    [since]
  );
  const governanceEvents = safeScalar(
    db,
    "SELECT COUNT(*) AS value FROM audit_entries WHERE created_at >= ?",
    [since]
  );
  const enabledSkills = safeScalar(
    db,
    "SELECT COUNT(*) AS value FROM skill_registry WHERE dispatch_status = 'enabled'"
  );
  const cronWarnings = safeScalar(
    db,
    "SELECT COUNT(*) AS value FROM cron_health_jobs WHERE status = 'active' AND (warning IS NOT NULL OR last_failure_at IS NOT NULL)"
  );
  const localFootprint = collectLocalFootprintInventory(process.cwd());
  const memoryIteration = buildMemoryIterationSnapshot(db, localFootprint);
  const operatorLoadStatus = readOperatorLoadReport(findRepoRoot(process.cwd()));


  const lastMessage = safeLatest(
    db,
    `SELECT MAX(timestamp) AS value FROM messages m WHERE m.timestamp >= ? ${ws}`,
    [since]
  );

  // Independent latest-timestamp probes for each metric so observedAt
  // reflects the source's own freshness, not a reused message-table value.
  // Finding (2): each dispatch metric now derives observedAt from the
  // SAME population it counts (status-filtered), so an empty active set
  // does NOT borrow from the latest failed row.
  const latestActiveHive = safeLatest(
    db,
    "SELECT MAX(updated_at) AS value FROM hive_delegations WHERE status IN ('pending','active','paused')"
  );
  const latestFailedHive = safeLatest(
    db,
    "SELECT MAX(updated_at) AS value FROM hive_delegations WHERE status = 'failed'"
  );
  const latestHiveActions = safeLatest(
    db,
    `SELECT MAX(timestamp) AS value FROM hive_actions a WHERE a.timestamp >= ? ${hawkws}`,
    [since]
  );
  const latestSkills = safeLatest(
    db,
    "SELECT MAX(updated_at) AS value FROM skill_registry WHERE dispatch_status = 'enabled'"
  );
  const latestCron = safeLatest(
    db,
    "SELECT MAX(COALESCE(last_failure_at, updated_at)) AS value FROM cron_health_jobs WHERE status = 'active' AND (warning IS NOT NULL OR last_failure_at IS NOT NULL)"
  );

  // Selected-scope envelopes (window + workspace applied in the SQL).
  const memoryRowsEnvelope = envelopeFromScalar(memoryRows, "sqlite://messages", scope, {
    latestAt: lastMessage.ok ? lastMessage.latestAt : null,
    reason: lastMessage.ok
      ? "Direct memory rows counted from SQLite messages for the selected window and workspace"
      : lastMessage.error ?? "Failed to query SQLite messages",
  });
  // Round 4 [F1]: the Hive Actions card must show a hive_actions
  // metric, NOT memoryRows. We count hive_actions rows directly so
  // the source label is `/api/hive` (which surfaces hive_actions).
  // observedAt comes from the hive_actions probe, not messages.
  const hiveActionsEnvelope = envelopeFromScalar(hiveActions, "/api/hive", scope, {
    latestAt: latestHiveActions.ok ? latestHiveActions.latestAt : null,
    reason: latestHiveActions.ok
      ? "Hive actions counted from hive_actions via /api/hive for the selected window and workspace"
      : latestHiveActions.error ?? "Failed to query hive_actions",
  });
  // Finding (1): governanceEvents queries audit_entries only by window —
  // it does NOT partition by workspace. The envelope must disclose its
  // true scope so the UI/API is not misled by the requested workspace.
  const governanceScope: MetricScope = { window, workspace: "all" };
  const latestGovernance = safeLatest(
    db,
    "SELECT MAX(created_at) AS value FROM audit_entries WHERE created_at >= ?",
    [since]
  );
  const governanceEventsEnvelope = envelopeFromScalar(governanceEvents, "sqlite://audit_entries", governanceScope, {
    latestAt: latestGovernance.ok ? latestGovernance.latestAt : null,
    reason:
      "Audit entries created within the selected window — workspace selection does not partition this source (workspace=all in the envelope).",
  });

  // Cumulative/fixed-scope envelopes (window/workspace NOT applied in the SQL).
  // Each envelope advertises its real scope so the UI/API cannot be misled.
  const dispatchScope: MetricScope = { window: "all", workspace: "all" };
  const skillsScope: MetricScope = { window: "all", workspace: "all" };
  const cronScope: MetricScope = { window: "all", workspace: "all" };
  // Finding (2): observedAt for each dispatch metric now comes from the
  // status-filtered population (latestActiveHive / latestFailedHive), not
  // from the unfiltered MAX(updated_at) of the whole hive_delegations table.
  const activeDispatchesEnvelope = envelopeFromScalar(activeDispatches, "sqlite://hive_delegations", dispatchScope, {
    latestAt: latestActiveHive.ok ? latestActiveHive.latestAt : null,
    reason:
      "Active, pending, or paused hive delegations counted across all tenants (cumulative scope, window/workspace filters do not apply). observedAt is the latest updated_at of status IN ('pending','active','paused') rows.",
  });
  const failedWorkEnvelope = envelopeFromScalar(failedWork, "sqlite://hive_delegations", dispatchScope, {
    latestAt: latestFailedHive.ok ? latestFailedHive.latestAt : null,
    reason:
      "Failed hive delegations counted across all tenants (cumulative scope, window/workspace filters do not apply). observedAt is the latest updated_at of status='failed' rows.",
  });
  const enabledSkillsEnvelope = envelopeFromScalar(enabledSkills, "sqlite://skill_registry", skillsScope, {
    latestAt: latestSkills.ok ? latestSkills.latestAt : null,
    reason: "Skills with dispatch_status='enabled' (cumulative, not scoped to the selected window).",
  });
  const cronWarningsEnvelope = envelopeFromScalar(cronWarnings, "sqlite://cron_health_jobs", cronScope, {
    latestAt: latestCron.ok ? latestCron.latestAt : null,

    reason: "Active cron jobs with warnings or last_failure_at set (current snapshot, not windowed).",
  });
  const localFootprintEnvelope = metricEnvelope({    value: localFootprint.totalBytes,
    status: localFootprint.pressure === "critical" ? "degraded" : "live",
    source: "local://footprint-inventory",
    observedAt: localFootprint.generatedAt,
    scope,
    reason: localFootprint.pressure === "critical"
      ? "Local footprint pressure is critical; cloud offload candidates listed"
      : "Local footprint inventory collected from repo and home store profiles",
  });

  return Response.json({
    ok: true,
    filters: { window, workspace, since },
    generatedAt: new Date().toISOString(),
    metrics: {
      memoryRows: memoryRowsEnvelope,
      hiveActions: hiveActionsEnvelope,
      activeDispatches: activeDispatchesEnvelope,
      failedWork: failedWorkEnvelope,
      governanceEvents: governanceEventsEnvelope,
      enabledSkills: enabledSkillsEnvelope,
      cronWarnings: cronWarningsEnvelope,
      localFootprint: localFootprintEnvelope,
      memoryIteration,
    },
    attention: attention.items,
    agentActivity,
    sourceStates: {
      attention: attention.sourceState,
      agentActivity: agentActivity.sourceState,
      // Preserved contract: EfficiencySignals is known-unwired, not empty/error.
      efficiencySignals: "known_unwired" as const,
    },
    operatorLoadStatus: operatorLoadStatus ?? {
      status: "missing",
      p95Ms: null,
      errorRate: null,
      generatedAt: null,
      ageHours: null,
      targetHost: null,
      endpoint: null,
      findings: [],
      gitSha: null,
    },

    panels: {
      pulse: panelFromEnvelope(memoryRowsEnvelope, activeDispatchesEnvelope, lastMessage),
      memory: panelFromEnvelope(memoryRowsEnvelope, null, lastMessage),
      dispatch: panelFromEnvelope(activeDispatchesEnvelope, null, latestActiveHive),
      governance: panelFromEnvelope(governanceEventsEnvelope, null, latestGovernance),
      skills: panelFromEnvelope(enabledSkillsEnvelope, null, latestSkills),

      cron: panelFromEnvelope(cronWarningsEnvelope, null, latestCron),
      localFootprint: panel(        localFootprint.pressure === "critical" ? "degraded" : "live",
        "local footprint inventory",
        localFootprint.generatedAt,
        localFootprint.warnings
      ),
      memoryIteration: panel(
        memoryIteration.status === "healthy" ? "live" : "degraded",
        "SQLite/QMD/embedding iteration loop",
        memoryIteration.observe.lastDiscordMessageAt ?? localFootprint.generatedAt,
        memoryIteration.warnings
      ),
      operatorLoad: panel(
        operatorLoadStatus?.status === "pass"
          ? "live"
          : operatorLoadStatus?.status === "missing"
            ? "missing"
            : "degraded",
        "reports/operator-load/latest.json",
        operatorLoadStatus?.generatedAt ?? null,
        operatorLoadStatus?.status === "pass"
          ? []
          : [
              `Latest operator load report is "${operatorLoadStatus?.status ?? "missing"}"` +
                (operatorLoadStatus?.p95Ms != null
                  ? ` (p95=${operatorLoadStatus.p95Ms}ms, errorRate=${operatorLoadStatus.errorRate ?? "n/a"})`
                  : ""),
            ]
      ),
    },
    localFootprint,
    memoryIteration,
    skills: {
      deprecated: listDeprecatedSkills(db, { limit: 50 }),
    },
  });
}

export async function GET(request: Request) {
  try {
    return await buildNocResponse(request);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
