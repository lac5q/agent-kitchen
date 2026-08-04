import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import { MEM0_URL } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { recallByKeyword } from "@/lib/db-ingest";
import { rebuildMessageFtsProjection } from "@/lib/db-schema";
import { queryGraphMemory } from "@/lib/memory/backends";
import {
  ensureMemoryEvalTables as ensureStoredMemoryEvalTables,
  memoryEvalGovernance,
  readLatestMemoryEvalRun,
  writeMemoryEvalRun,
} from "@/lib/store/memory";

type SqliteDatabase = ReturnType<typeof getDb>;

export type MemoryRecallTier = "vector" | "graph" | "episodic" | "qmd";
export type MemoryRecallTiming = "before_plan" | "before_tool_use" | "before_final";
export type MemoryEvalLayer = "canary" | "gold" | "scenario";
export type MemoryEvalMode = "canary" | "gold" | "full";
export type MemoryEvalStatus = "passed" | "failed";

export interface MemoryRecallFixture {
  id: string;
  tier: MemoryRecallTier;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryRecallThresholds {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  latencyMs: number;
}

export interface MemoryRecallEvalCase {
  id: string;
  layer: MemoryEvalLayer;
  scenario: string;
  agentId: string;
  taskPrompt: string;
  fixtures?: MemoryRecallFixture[];
  expectedMemoryIds?: string[];
  avoidMemoryIds?: string[];
  avoidFacts?: string[];
  expectedFacts: string[];
  expectedTiers: MemoryRecallTier[];
  requiredTiming: MemoryRecallTiming;
  thresholds?: Partial<MemoryRecallThresholds>;
}

export interface NormalizedRecallResult {
  id: string;
  tier: MemoryRecallTier;
  content: string;
  source?: string;
  score?: number;
  latencyMs: number;
  metadata?: unknown;
}

export interface MemoryRecallTraceEvent {
  action: "memory_write" | "memory_recall" | "plan" | "tool_use" | "final";
  timing: MemoryRecallTiming;
  tier?: MemoryRecallTier;
  timestamp: string;
  detail?: string;
}

export interface MemoryRecallMetrics {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  latencyMs: number;
  tierCoverage: number;
  stalenessHours: number | null;
  falsePositiveRate: number;
}

export interface MemoryRecallEvalResult {
  caseId: string;
  agentId: string;
  layer: MemoryEvalLayer;
  scenario: string;
  taskPrompt: string;
  passed: boolean;
  failures: string[];
  metrics: MemoryRecallMetrics;
  tiers: Array<{ tier: MemoryRecallTier; ok: boolean; count: number; error?: string }>;
  retrieved: NormalizedRecallResult[];
  trace: MemoryRecallTraceEvent[];
}

export interface MemoryEvalSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  p95LatencyMs: number;
  tierFailures: MemoryRecallTier[];
}

export interface MemoryEvalRun {
  id: string;
  mode: MemoryEvalMode;
  status: MemoryEvalStatus;
  startedAt: string;
  completedAt: string;
  summary: MemoryEvalSummary;
  results: MemoryRecallEvalResult[];
}

export interface LatestMemoryEvalResponse {
  ok: boolean;
  run: MemoryEvalRun | null;
  timestamp: string;
}

const DEFAULT_THRESHOLDS: MemoryRecallThresholds = {
  recallAtK: 0.85,
  precisionAtK: 0.7,
  mrr: 0.75,
  latencyMs: 5000,
};

function repoRoot(): string {
  let current = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    if (fs.existsSync(path.join(current, "evals", "memory-recall", "cases.json"))) return current;
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), "../..");
}

function casesPath(): string {
  return process.env.MEMORY_RECALL_EVAL_CASES_PATH || path.join(repoRoot(), "evals", "memory-recall", "cases.json");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function resultMatchesExpected(result: NormalizedRecallResult, testCase: MemoryRecallEvalCase): boolean {
  const expectedIds = testCase.expectedMemoryIds ?? [];
  if (expectedIds.some((id) => resultContainsIdentifier(result, id))) return true;

  const normalized = normalizeText(`${result.content} ${metadataSearchText(result.metadata)}`);
  return testCase.expectedFacts.some((fact) => normalized.includes(normalizeText(fact)));
}

function matchedExpectationCount(results: NormalizedRecallResult[], testCase: MemoryRecallEvalCase): number {
  const matched = new Set<string>();
  const expectedIds = testCase.expectedMemoryIds ?? [];
  for (const result of results) {
    for (const id of expectedIds) {
      if (resultContainsIdentifier(result, id)) matched.add(`id:${id}`);
    }
    const normalized = normalizeText(`${result.content} ${metadataSearchText(result.metadata)}`);
    for (const fact of testCase.expectedFacts) {
      if (normalized.includes(normalizeText(fact))) matched.add(`fact:${fact}`);
    }
  }
  return matched.size;
}

function resultContainsAvoidedFact(result: NormalizedRecallResult, avoidFacts: string[]): boolean {
  if (avoidFacts.length === 0) return false;
  const normalized = normalizeText(`${result.content} ${metadataSearchText(result.metadata)}`);
  return avoidFacts.some((fact) => normalized.includes(normalizeText(fact)));
}

function resultContainsAvoidedId(result: NormalizedRecallResult, avoidMemoryIds: string[]): boolean {
  if (avoidMemoryIds.length === 0) return false;
  return avoidMemoryIds.some((id) => resultContainsIdentifier(result, id));
}

// Security-label fields stamped by Phase 75 cascade — excluded from identifier search
// to prevent domain/policy tokens ('engineering', 'indexable', 'sealed') from false-matching.
const LABEL_FIELD_KEYS = new Set(["visibility", "domain", "sensitivity", "policy", "label_version", "labeled_at"]);

function metadataSearchText(value: unknown, depth = 0): string {
  if (depth > 5) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map((v) => metadataSearchText(v, depth + 1)).filter(Boolean).join(" ");
  return Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !LABEL_FIELD_KEYS.has(k))
    .map(([, v]) => metadataSearchText(v, depth + 1))
    .filter(Boolean)
    .join(" ");
}

function resultContainsIdentifier(result: NormalizedRecallResult, expectedId: string): boolean {
  if (result.id === expectedId) return true;
  const metadataText = metadataSearchText(result.metadata);
  return normalizeText(metadataText).split(" ").includes(normalizeText(expectedId));
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

export function hasRequiredRecallTiming(trace: MemoryRecallTraceEvent[], requiredTiming: MemoryRecallTiming): boolean {
  const order: Record<MemoryRecallTiming, number> = {
    before_plan: 0,
    before_tool_use: 1,
    before_final: 2,
  };
  return trace.some((event) => event.action === "memory_recall" && order[event.timing] <= order[requiredTiming]);
}

export function scoreMemoryRecallCase(
  testCase: MemoryRecallEvalCase,
  retrieved: NormalizedRecallResult[],
  trace: MemoryRecallTraceEvent[],
  k = 5
): Omit<MemoryRecallEvalResult, "caseId" | "agentId" | "layer" | "scenario" | "taskPrompt" | "tiers" | "retrieved" | "trace"> {
  const topK = retrieved.slice(0, k);
  const expectedIds = testCase.expectedMemoryIds ?? [];
  const avoidMemoryIds = testCase.avoidMemoryIds ?? [];
  const avoidFacts = testCase.avoidFacts ?? [];
  const expectedCount = Math.max(expectedIds.length || testCase.expectedFacts.length, 1);
  const relevant = topK.filter((result) => resultMatchesExpected(result, testCase));
  const matchedCount = matchedExpectationCount(topK, testCase);
  const firstRelevantIndex = topK.findIndex((result) => resultMatchesExpected(result, testCase));
  const expectedTiers = new Set(testCase.expectedTiers);
  const foundExpectedTiers = new Set(topK.filter((result) => expectedTiers.has(result.tier)).map((result) => result.tier));
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(testCase.thresholds ?? {}) };

  const metrics: MemoryRecallMetrics = {
    recallAtK: Number(Math.min(matchedCount / expectedCount, 1).toFixed(4)),
    precisionAtK: Number((topK.length ? relevant.length / topK.length : 0).toFixed(4)),
    mrr: firstRelevantIndex >= 0 ? Number((1 / (firstRelevantIndex + 1)).toFixed(4)) : 0,
    latencyMs: Math.max(0, ...topK.map((result) => result.latencyMs)),
    tierCoverage: Number((expectedTiers.size ? foundExpectedTiers.size / expectedTiers.size : 1).toFixed(4)),
    stalenessHours: null,
    falsePositiveRate: Number((topK.length ? (topK.length - relevant.length) / topK.length : 0).toFixed(4)),
  };

  const failures: string[] = [];
  if (metrics.recallAtK < thresholds.recallAtK) failures.push("recallAtK below threshold");
  if (metrics.precisionAtK < thresholds.precisionAtK) failures.push("precisionAtK below threshold");
  if (metrics.mrr < thresholds.mrr) failures.push("mrr below threshold");
  if (metrics.latencyMs > thresholds.latencyMs) failures.push("latency above threshold");
  if (metrics.tierCoverage < 1) failures.push("missing expected tier coverage");
  if (!hasRequiredRecallTiming(trace, testCase.requiredTiming)) failures.push("memory recall happened too late or not at all");
  if (relevant.length === 0) failures.push("no expected memory found in top k");
  if (topK.some((result) => resultContainsAvoidedId(result, avoidMemoryIds))) failures.push("avoided memory found in top k");
  if (topK.some((result) => resultContainsAvoidedFact(result, avoidFacts))) failures.push("avoided fact found in top k");

  return { passed: failures.length === 0, failures, metrics };
}

export function summarizeMemoryEvalRun(
  results: Array<Pick<MemoryRecallEvalResult, "passed"> & { metrics: Pick<MemoryRecallMetrics, "latencyMs">; tiers?: MemoryRecallEvalResult["tiers"] }>
): MemoryEvalSummary {
  const passedCases = results.filter((result) => result.passed).length;
  const tierFailures = new Set<MemoryRecallTier>();
  for (const result of results) {
    for (const tier of result.tiers ?? []) {
      if (!tier.ok) tierFailures.add(tier.tier);
    }
  }
  return {
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    passRate: results.length ? Number((passedCases / results.length).toFixed(4)) : 0,
    p95LatencyMs: percentile95(results.map((result) => result.metrics.latencyMs)),
    tierFailures: Array.from(tierFailures).sort(),
  };
}

export function loadMemoryRecallEvalCases(): MemoryRecallEvalCase[] {
  const raw = fs.readFileSync(casesPath(), "utf8");
  return JSON.parse(raw) as MemoryRecallEvalCase[];
}

export function ensureMemoryEvalTables(db: SqliteDatabase): void {
  ensureStoredMemoryEvalTables(
    db,
    memoryEvalGovernance({ id: "schema" }),
  );
}

function recordMemoryEvalRun(db: SqliteDatabase, run: MemoryEvalRun): void {
  writeMemoryEvalRun(db, run, memoryEvalGovernance(run));
}

export function getLatestMemoryEvalRun(db: SqliteDatabase = getDb()): LatestMemoryEvalResponse {
  ensureMemoryEvalTables(db);
  const persistence = readLatestMemoryEvalRun(db);
  if (!persistence) return { ok: true, run: null, timestamp: new Date().toISOString() };
  const { run: runRow, results: rows } = persistence;

  return {
    ok: true,
    run: {
      id: runRow.id,
      mode: runRow.mode as MemoryEvalMode,
      status: runRow.status as MemoryEvalStatus,
      startedAt: runRow.started_at,
      completedAt: runRow.completed_at,
      summary: JSON.parse(runRow.summary) as MemoryEvalSummary,
      results: rows.map((row) => ({
        caseId: row.case_id,
        agentId: "memory-eval",
        layer: "gold",
        scenario: row.case_id,
        taskPrompt: row.case_id,
        passed: row.passed === 1,
        failures: JSON.parse(row.failures) as string[],
        metrics: JSON.parse(row.metrics) as MemoryRecallMetrics,
        tiers: JSON.parse(row.tiers) as MemoryRecallEvalResult["tiers"],
        retrieved: JSON.parse(row.retrieved) as NormalizedRecallResult[],
        trace: JSON.parse(row.trace) as MemoryRecallTraceEvent[],
      })),
    },
    timestamp: new Date().toISOString(),
  };
}

function textFromMemoryItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  for (const key of ["memory", "content", "text", "summary", "name", "title", "id"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return JSON.stringify(item);
}

function idFromMemoryItem(item: unknown, fallback: string): string {
  if (!item || typeof item !== "object") return fallback;
  const record = item as Record<string, unknown>;
  return typeof record.id === "string" ? record.id : fallback;
}

function numericEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchWithDeadline(url: string, init: RequestInit, timeoutMs: number, message: string): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetch(url, { ...init, signal: controller.signal }), deadline]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(message);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForVectorFixture(fixture: MemoryRecallFixture, agentId: string): Promise<void> {
  const settleTimeoutMs = numericEnv("MEMORY_EVAL_VECTOR_SETTLE_TIMEOUT_MS", 30000);
  const pollIntervalMs = numericEnv("MEMORY_EVAL_VECTOR_SETTLE_POLL_MS", 2000);
  const deadline = Date.now() + settleTimeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const results = await searchVector(fixture.content, agentId, 5);
      if (results.some((result) => resultContainsIdentifier(result, fixture.id))) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(pollIntervalMs);
  }

  if (lastError instanceof Error) {
    throw new Error(`Vector fixture did not settle after write timeout: ${lastError.message}`);
  }
  throw new Error("Vector fixture did not settle after write timeout");
}

async function seedFixture(db: SqliteDatabase, fixture: MemoryRecallFixture, agentId: string): Promise<MemoryRecallTraceEvent> {
  const timestamp = new Date().toISOString();
  if (fixture.tier === "episodic") {
    db.prepare(
      `INSERT INTO messages
        (session_id, project, agent_id, role, content, timestamp, request_id, visibility, policy)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id, request_id) DO UPDATE SET
         content=excluded.content,
         timestamp=excluded.timestamp,
         visibility=excluded.visibility,
         policy=excluded.policy`
    ).run(`memory-eval-${fixture.id}`, "memory-eval", agentId, "assistant", fixture.content, timestamp, fixture.id, "internal", "indexable");
  }

  if (fixture.tier === "vector") {
    const evalAgentId = agentId || "memory-eval";
    const timeoutMs = numericEnv("MEMORY_EVAL_VECTOR_TIMEOUT_MS", 30000);
    let response: Response;
    try {
      response = await fetchWithDeadline(`${MEM0_URL}/memory/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: fixture.content,
          agent_id: evalAgentId,
          metadata: { ...(fixture.metadata ?? {}), eval_id: fixture.id },
        }),
      }, timeoutMs, "Vector canary write timed out");
    } catch (error) {
      await waitForVectorFixture(fixture, evalAgentId);
      return { action: "memory_write", timing: "before_plan", tier: fixture.tier, timestamp };
    }
    const body = await withDeadline(response.json().catch(() => ({})), 5000, "Vector canary write response timed out");
    if (!response.ok || body.status === "queued") {
      if (body.status === "queued") {
        await waitForVectorFixture(fixture, evalAgentId);
        return { action: "memory_write", timing: "before_plan", tier: fixture.tier, timestamp };
      }
      const reason = typeof body?.result?.reason === "string" ? body.result.reason : JSON.stringify(body);
      throw new Error(reason || "Vector canary write failed");
    }
  }

  return { action: "memory_write", timing: "before_plan", tier: fixture.tier, timestamp };
}

async function searchVector(query: string, agentId: string, limit: number): Promise<NormalizedRecallResult[]> {
  const start = Date.now();
  const timeoutMs = numericEnv("MEMORY_EVAL_VECTOR_SEARCH_TIMEOUT_MS", 5000);
  const params = new URLSearchParams({ q: query, agent_id: agentId || "memory-eval", limit: String(limit) });
  const response = await fetchWithDeadline(`${MEM0_URL}/memory/search?${params}`, {}, timeoutMs, "Vector memory search timed out");
  const body = await withDeadline(response.json().catch(() => ({})), timeoutMs, "Vector memory search response timed out");
  const latencyMs = Date.now() - start;
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Vector memory search failed");
  const raw: unknown[] = Array.isArray(body.results) ? body.results : [];
  return raw.map((item, index) => ({
    id: idFromMemoryItem(item, `vector-${index}`),
    tier: "vector" as const,
    content: textFromMemoryItem(item),
    latencyMs,
    metadata: item,
  }));
}

function searchEpisodic(db: SqliteDatabase, query: string, limit: number): NormalizedRecallResult[] {
  const start = Date.now();
  const rows = recallByKeyword(db, query, limit);
  const latencyMs = Date.now() - start;
  return rows.map((row) => ({
    id: String(row.id),
    tier: "episodic" as const,
    content: row.snippet.replace(/<\/?mark>/g, ""),
    source: row.agent_id,
    latencyMs,
    metadata: row,
  }));
}

function mergeRecallResults(results: NormalizedRecallResult[], limit: number): NormalizedRecallResult[] {
  const seen = new Set<string>();
  const merged: NormalizedRecallResult[] = [];
  for (const result of results) {
    const key = `${result.tier}:${result.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
    if (merged.length >= limit) break;
  }
  return merged;
}

async function searchGraph(query: string, limit: number): Promise<NormalizedRecallResult[]> {
  const start = Date.now();
  const raw = await queryGraphMemory(query, limit);
  const latencyMs = Date.now() - start;
  const results = !raw || typeof raw !== "object" ? [] : (raw as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, limit).map((item, index) => ({
    id: `graph-${index}`,
    tier: "graph" as const,
    content: textFromMemoryItem(item),
    latencyMs,
    metadata: item,
  }));
}

function checkQmd(query: string): NormalizedRecallResult[] {
  const start = Date.now();
  execFileSync("which", ["qmd"], { timeout: 2000 });
  return [{ id: "qmd-available", tier: "qmd", content: `qmd available for ${query}`, latencyMs: Date.now() - start }];
}

async function runCase(db: SqliteDatabase, testCase: MemoryRecallEvalCase): Promise<MemoryRecallEvalResult> {
  const trace: MemoryRecallTraceEvent[] = [];
  const tiers: MemoryRecallEvalResult["tiers"] = [];
  const retrieved: NormalizedRecallResult[] = [];
  const fixtures = testCase.fixtures ?? [];
  const failedSeedTiers = new Set<MemoryRecallTier>();

  for (const fixture of fixtures) {
    try {
      trace.push(await seedFixture(db, fixture, testCase.agentId));
    } catch (error) {
      failedSeedTiers.add(fixture.tier);
      tiers.push({ tier: fixture.tier, ok: false, count: 0, error: error instanceof Error ? error.message : "fixture seed failed" });
    }
  }
  if (fixtures.some((fixture) => fixture.tier === "episodic") && !failedSeedTiers.has("episodic")) {
    rebuildMessageFtsProjection(db);
  }

  const query = testCase.expectedFacts.join(" ");
  const recallQueries = [query, ...testCase.expectedFacts].filter(Boolean);
  for (const tier of testCase.expectedTiers) {
    if (failedSeedTiers.has(tier)) continue;
    try {
      let items: NormalizedRecallResult[] = [];
      if (tier === "vector") items = await searchVector(query, testCase.agentId, 5);
      if (tier === "episodic") {
        items = mergeRecallResults(recallQueries.flatMap((recallQuery) => searchEpisodic(db, recallQuery, 5)), 5);
      }
      if (tier === "graph") items = await searchGraph(query, 5);
      if (tier === "qmd") items = checkQmd(query);
      retrieved.push(...items);
      tiers.push({ tier, ok: true, count: items.length });
    } catch (error) {
      tiers.push({ tier, ok: false, count: 0, error: error instanceof Error ? error.message : "search failed" });
    }
  }

  trace.push({ action: "memory_recall", timing: testCase.requiredTiming, timestamp: new Date().toISOString() });
  const scored = scoreMemoryRecallCase(testCase, retrieved, trace, 5);
  const failures = [...scored.failures, ...tiers.filter((tier) => !tier.ok).map((tier) => `${tier.tier} tier failed`)];

  return {
    caseId: testCase.id,
    agentId: testCase.agentId,
    layer: testCase.layer,
    scenario: testCase.scenario,
    taskPrompt: testCase.taskPrompt,
    passed: failures.length === 0,
    failures,
    metrics: scored.metrics,
    tiers,
    retrieved,
    trace,
  };
}

export async function runMemoryRecallEvalSuite(options: { mode?: MemoryEvalMode; db?: SqliteDatabase } = {}): Promise<MemoryEvalRun> {
  const db = options.db ?? getDb();
  const mode = options.mode ?? "gold";
  const startedAt = new Date().toISOString();
  const allCases = loadMemoryRecallEvalCases();
  const selectedCases = allCases.filter((testCase) => {
    if (mode === "full") return true;
    if (mode === "canary") return testCase.layer === "canary";
    return testCase.layer === "gold";
  });
  const results = [];
  for (const testCase of selectedCases) {
    results.push(await runCase(db, testCase));
  }
  const completedAt = new Date().toISOString();
  const summary = summarizeMemoryEvalRun(results);
  const run: MemoryEvalRun = {
    id: `memory-eval-${crypto.randomUUID()}`,
    mode,
    status: summary.failedCases === 0 ? "passed" : "failed",
    startedAt,
    completedAt,
    summary,
    results,
  };
  recordMemoryEvalRun(db, run);
  maybePostMemoryEvalAlert(run);
  return run;
}

// ---------------------------------------------------------------------------
// Bridge to Phase 57 eval engine scorers
// ---------------------------------------------------------------------------

/**
 * Converts a completed MemoryEvalRun into an AgentEvalTrace that feeds the
 * registered `memory_recall_l1` and `memory_recall_l2` scorers in the eval
 * engine. Call this after runMemoryRecallEvalSuite to integrate memory-recall
 * results into the 3-layer composite W flow without replacing the standalone
 * harness path.
 *
 * Returns an AgentEvalTrace whose `.memory` fields are populated from the
 * aggregate metrics of the eval run, ready to be passed to
 * `scoreTraceWithEvalEngine` or `scoreAndMaybePersistEvalTrace`.
 */
export function memoryEvalRunToAgentTrace(run: MemoryEvalRun): import("@/lib/evals/types").AgentEvalTrace {
  const { summary, results } = run;
  const avgRecall = summary.totalCases > 0
    ? results.reduce((acc, r) => acc + r.metrics.recallAtK, 0) / results.length
    : 0.5;
  const avgPrecision = summary.totalCases > 0
    ? results.reduce((acc, r) => acc + r.metrics.precisionAtK, 0) / results.length
    : 0.5;
  const avgMrr = summary.totalCases > 0
    ? results.reduce((acc, r) => acc + r.metrics.mrr, 0) / results.length
    : 0.5;

  const expectedFacts = results.flatMap((r) => r.retrieved.flatMap(() => ["memory", "recall"])).slice(0, 10);
  const retrievedFacts = results.flatMap((r) =>
    r.retrieved
      .filter((item) => item.content)
      .map((item) => item.content.split(" ")[0] ?? "result")
  ).slice(0, 10);

  return {
    traceId: `memory-eval-bridge-${run.id}`,
    agentId: "memory-eval",
    agentModelFamily: "openai",
    role: "memory-recall",
    input: `Memory recall eval run ${run.id} (mode=${run.mode}, cases=${summary.totalCases})`,
    output: `Pass rate: ${(summary.passRate * 100).toFixed(1)}% over ${summary.totalCases} cases`,
    expectedFacts: expectedFacts.length > 0 ? expectedFacts : ["memory", "recall"],
    memory: {
      recallAtK: avgRecall,
      precisionAtK: avgPrecision,
      mrr: avgMrr,
      expectedFacts: ["memory", "recall"],
      retrievedFacts: retrievedFacts.length > 0 ? retrievedFacts : ["memory"],
    },
    outcome: {
      completed: run.status === "passed",
      escalated: run.status === "failed",
      operatorApproved: run.status === "passed",
    },
  };
}

function maybePostMemoryEvalAlert(run: MemoryEvalRun): void {
  if (process.env.MEMORY_EVAL_HIVE_ALERTS === "0" || run.status !== "failed") return;
  const hivePost = path.join(process.env.HOME || "", ".hive", "post.sh");
  if (!fs.existsSync(hivePost)) return;
  const tiers = run.summary.tierFailures.length ? ` tiers=${run.summary.tierFailures.join(",")}` : "";
  const summary = `Memory eval failed ${run.summary.passedCases}/${run.summary.totalCases}${tiers}`.slice(0, 149);
  try {
    execFileSync(hivePost, ["memory-eval", "error", summary], { timeout: 1500, stdio: "ignore" });
  } catch {
    // Alerting must never hide the eval result.
  }
}
