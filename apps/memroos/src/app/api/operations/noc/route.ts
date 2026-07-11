import { apiError } from "@/lib/api-error";
import { collectLocalFootprintInventory } from "@/lib/cloud-offload/footprint";
import { getDb } from "@/lib/db";
import { buildMemoryIterationSnapshot } from "@/lib/memory-doctor";
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

function scalar(db: ReturnType<typeof getDb>, sql: string, params: unknown[] = []): number {
  try {
    const row = db.prepare(sql).get(...params) as { value?: number } | undefined;
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
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

async function buildNocResponse(request: Request) {
  const url = new URL(request.url);
  const window = normalizeNocWindow(url.searchParams.get("window"));
  const workspace = normalizeNocWorkspace(url.searchParams.get("workspace"));
  const since = nocWindowToSinceIso(window);
  const db = getDb();
  const ws = workspaceClause(workspace);
  const efficiencyMetrics = computeEfficiencyMetrics(readEfficiencyEvents(db, since, workspace));

  const memoryRows = scalar(
    db,
    `SELECT COUNT(*) AS value FROM messages m WHERE m.timestamp >= ? ${ws}`,
    [since]
  );
  const activeDispatches = scalar(
    db,
    "SELECT COUNT(*) AS value FROM hive_delegations WHERE status IN ('pending','active','paused')"
  );
  const failedWork = scalar(
    db,
    "SELECT COUNT(*) AS value FROM hive_delegations WHERE status = 'failed'"
  );
  const governanceEvents = scalar(
    db,
    "SELECT COUNT(*) AS value FROM audit_entries WHERE created_at >= ?",
    [since]
  );
  const enabledSkills = scalar(
    db,
    "SELECT COUNT(*) AS value FROM skill_registry WHERE dispatch_status = 'enabled'"
  );
  const cronWarnings = scalar(
    db,
    "SELECT COUNT(*) AS value FROM cron_health_jobs WHERE status = 'active' AND (warning IS NOT NULL OR last_failure_at IS NOT NULL)"
  );
  const localFootprint = collectLocalFootprintInventory(process.cwd());
  const memoryIteration = buildMemoryIterationSnapshot(db, localFootprint);
  const operatorLoadStatus = readOperatorLoadReport(findRepoRoot(process.cwd()));

  const lastMessage = db
    .prepare(`SELECT MAX(timestamp) AS value FROM messages m WHERE m.timestamp >= ? ${ws}`)
    .get(since) as { value: string | null };

  return Response.json({
    ok: true,
    filters: { window, workspace, since },
    generatedAt: new Date().toISOString(),
    metrics: {
      memoryRows,
      activeDispatches,
      failedWork,
      governanceEvents,
      enabledSkills,
      cronWarnings,
      localFootprintBytes: localFootprint.totalBytes,
      memoryIteration,
      efficiency: efficiencyMetrics,
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
      pulse: panel(memoryRows > 0 || activeDispatches > 0 ? "live" : "empty", "SQLite messages + hive_delegations", lastMessage.value),
      memory: panel(memoryRows > 0 ? "live" : "empty", "SQLite messages", lastMessage.value),
      dispatch: panel(activeDispatches > 0 ? "live" : "empty", "hive_delegations", null),
      governance: panel(governanceEvents > 0 ? "live" : "empty", "audit_entries", null),
      skills: panel(enabledSkills > 0 ? "live" : "empty", "skill_registry", null),
      cron: panel(cronWarnings > 0 ? "degraded" : "live", "cron_health_jobs", null),
      localFootprint: panel(
        localFootprint.pressure === "critical" ? "degraded" : "live",
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
      efficiency: efficiencyPanelFor(efficiencyMetrics),
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
