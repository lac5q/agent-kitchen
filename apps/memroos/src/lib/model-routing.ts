import crypto from "crypto";
import type Database from "better-sqlite3";
import { recordEfficiencyEvent } from "@/lib/efficiency-telemetry";

export type ModelRoutingStrategy = "balanced" | "cost" | "quality" | "latency";

export interface ModelRoutingEventInput {
  taskType: string;
  taskId?: string;
  agentId?: string;
  provider: string;
  model: string;
  strategy?: ModelRoutingStrategy;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  rawContextTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  success?: boolean;
  qualityScore?: number;
  contextTags?: string[];
  prompt?: string;
  error?: string;
}

export interface ModelRoutingEvent {
  id: number;
  taskType: string;
  agentId: string | null;
  provider: string;
  model: string;
  strategy: ModelRoutingStrategy;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  success: boolean;
  qualityScore: number | null;
  contextTags: string[];
  promptHash: string | null;
  error: string | null;
  createdAt: string;
}

interface ModelRoutingEventRow {
  id: number;
  task_type: string;
  agent_id: string | null;
  provider: string;
  model: string;
  strategy: ModelRoutingStrategy;
  latency_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  success: number;
  quality_score: number | null;
  context_tags: string;
  prompt_hash: string | null;
  error: string | null;
  created_at: string;
}

export interface ModelCatalogEntry {
  provider: string;
  model: string;
  label: string;
  strengths: string[];
  taskTypes: string[];
  costScore: number;
  qualityScore: number;
  latencyScore: number;
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    provider: "openai",
    model: "gpt-5.4-mini",
    label: "Fast generalist",
    strengths: ["routing", "summaries", "routine engineering"],
    taskTypes: ["product", "sales", "engineering", "support"],
    costScore: 0.86,
    qualityScore: 0.78,
    latencyScore: 0.84,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet",
    label: "Deep implementation",
    strengths: ["large refactors", "planning", "code review"],
    taskTypes: ["engineering", "product"],
    costScore: 0.62,
    qualityScore: 0.9,
    latencyScore: 0.68,
  },
  {
    provider: "google",
    model: "gemini-pro",
    label: "Long-context analysis",
    strengths: ["research", "document synthesis", "broad context"],
    taskTypes: ["product", "sales", "research"],
    costScore: 0.72,
    qualityScore: 0.82,
    latencyScore: 0.7,
  },
  {
    provider: "local",
    model: "qwen-coder-local",
    label: "Private local coding",
    strengths: ["private code", "cheap iteration", "offline fallback"],
    taskTypes: ["engineering"],
    costScore: 0.96,
    qualityScore: 0.68,
    latencyScore: 0.76,
  },
];

export function ensureModelRoutingSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_routing_events (
      id                 INTEGER PRIMARY KEY,
      task_type          TEXT    NOT NULL,
      agent_id           TEXT,
      provider           TEXT    NOT NULL,
      model              TEXT    NOT NULL,
      strategy           TEXT    NOT NULL DEFAULT 'balanced',
      latency_ms         INTEGER,
      input_tokens       INTEGER NOT NULL DEFAULT 0,
      output_tokens      INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL,
      success            INTEGER NOT NULL DEFAULT 1,
      quality_score      REAL,
      context_tags       TEXT    NOT NULL DEFAULT '[]',
      prompt_hash        TEXT,
      error              TEXT,
      created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS model_routing_events_lookup
      ON model_routing_events(task_type, model, created_at DESC);
    CREATE INDEX IF NOT EXISTS model_routing_events_created
      ON model_routing_events(created_at DESC);
  `);
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rowToEvent(row: ModelRoutingEventRow): ModelRoutingEvent {
  return {
    id: row.id,
    taskType: row.task_type,
    agentId: row.agent_id,
    provider: row.provider,
    model: row.model,
    strategy: row.strategy,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostUsd: row.estimated_cost_usd,
    success: row.success === 1,
    qualityScore: row.quality_score,
    contextTags: parseTags(row.context_tags),
    promptHash: row.prompt_hash,
    error: row.error,
    createdAt: row.created_at,
  };
}

function normalizeStrategy(strategy: unknown): ModelRoutingStrategy {
  return strategy === "cost" || strategy === "quality" || strategy === "latency" ? strategy : "balanced";
}

function promptHash(prompt: string | undefined): string | null {
  if (!prompt) return null;
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

function hasTokenLedgerFields(input: ModelRoutingEventInput): boolean {
  return [
    "inputTokens",
    "outputTokens",
    "rawContextTokens",
    "cachedTokens",
    "totalTokens",
  ].some((key) => Object.prototype.hasOwnProperty.call(input, key));
}

function tokenCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function recordTokenLedgerEvent(db: Database.Database, input: ModelRoutingEventInput): void {
  if (!hasTokenLedgerFields(input)) return;

  const rawContextTokens = tokenCount(input.rawContextTokens);
  const cachedTokens = tokenCount(input.cachedTokens);
  const totalTokens = typeof input.totalTokens === "number" && Number.isFinite(input.totalTokens)
    ? tokenCount(input.totalTokens)
    : tokenCount(input.inputTokens) + tokenCount(input.outputTokens) + cachedTokens;

  recordEfficiencyEvent(db, {
    eventType: "token_ledger",
    taskId: input.taskId ?? null,
    agentId: input.agentId ?? null,
    payload: {
      rawContextTokens,
      cachedTokens,
      totalTokens,
      // Explicit split so the Ledger can report output tokens (the costly
      // ones) instead of losing them inside totalTokens. Older readers
      // ignore unknown payload keys.
      inputTokens: tokenCount(input.inputTokens),
      outputTokens: tokenCount(input.outputTokens),
      modelId: `${input.provider}/${input.model}`,
    },
  });
}

export function recordModelRoutingEvent(
  db: Database.Database,
  input: ModelRoutingEventInput
): ModelRoutingEvent {
  ensureModelRoutingSchema(db);
  const result = db
    .prepare(
      `INSERT INTO model_routing_events (
         task_type, agent_id, provider, model, strategy, latency_ms, input_tokens,
         output_tokens, estimated_cost_usd, success, quality_score, context_tags,
         prompt_hash, error
       )
       VALUES (
         @taskType, @agentId, @provider, @model, @strategy, @latencyMs, @inputTokens,
         @outputTokens, @estimatedCostUsd, @success, @qualityScore, @contextTags,
         @promptHash, @error
       )`
    )
    .run({
      taskType: input.taskType,
      agentId: input.agentId ?? null,
      provider: input.provider,
      model: input.model,
      strategy: normalizeStrategy(input.strategy),
      latencyMs: input.latencyMs ?? null,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      estimatedCostUsd: input.estimatedCostUsd ?? null,
      success: input.success === false ? 0 : 1,
      qualityScore: input.qualityScore ?? null,
      contextTags: JSON.stringify(input.contextTags ?? []),
      promptHash: promptHash(input.prompt),
      error: input.error ?? null,
    });

  const row = db
    .prepare("SELECT * FROM model_routing_events WHERE id = ?")
    .get(result.lastInsertRowid) as ModelRoutingEventRow;
  recordTokenLedgerEvent(db, input);
  return rowToEvent(row);
}

export function listModelRoutingEvents(db: Database.Database, limit = 50): ModelRoutingEvent[] {
  ensureModelRoutingSchema(db);
  const safeLimit = Math.min(200, Math.max(1, limit));
  const rows = db
    .prepare("SELECT * FROM model_routing_events ORDER BY created_at DESC LIMIT ?")
    .all(safeLimit) as ModelRoutingEventRow[];
  return rows.map(rowToEvent);
}

/**
 * Aggregate model_routing_events token columns into the model-usage shape so
 * Ledger Tokens Processed / Model Mix reflect routed LLM calls when Claude
 * JSONL and efficiency token_ledger are empty (common on oracle-1).
 */
export function aggregateModelRoutingTokenUsage(
  db: Database.Database,
  since?: Date
): {
  models: Array<{
    id: string;
    name: string;
    inputTokens: number;
    outputTokens: number;
    cacheRead: number;
    cacheCreation: number;
    requests: number;
    totalTokens: number;
  }>;
  total: {
    inputTokens: number;
    outputTokens: number;
    cacheRead: number;
    cacheCreation: number;
    requests: number;
  };
} {
  ensureModelRoutingSchema(db);
  const params: Record<string, unknown> = {};
  let sinceClause = "";
  if (since && Number.isFinite(since.getTime())) {
    sinceClause = " AND created_at >= @since";
    params.since = since.toISOString();
  }

  const rows = db
    .prepare(
      `SELECT provider, model,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens,
              COUNT(*) AS requests
       FROM model_routing_events
       WHERE 1=1
         ${sinceClause}
       GROUP BY provider, model
       HAVING SUM(input_tokens) + SUM(output_tokens) > 0
       ORDER BY SUM(input_tokens) + SUM(output_tokens) DESC
       LIMIT 100`
    )
    .all(params) as Array<{
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    requests: number;
  }>;

  const models = rows.map((row) => {
    const inputTokens = Math.max(0, Number(row.input_tokens) || 0);
    const outputTokens = Math.max(0, Number(row.output_tokens) || 0);
    const id = `${row.provider}/${row.model}`;
    return {
      id,
      name: id,
      inputTokens,
      outputTokens,
      cacheRead: 0,
      cacheCreation: 0,
      requests: Math.max(0, Number(row.requests) || 0),
      totalTokens: inputTokens + outputTokens,
    };
  });

  const total = models.reduce(
    (t, m) => ({
      inputTokens: t.inputTokens + m.inputTokens,
      outputTokens: t.outputTokens + m.outputTokens,
      cacheRead: t.cacheRead + m.cacheRead,
      cacheCreation: t.cacheCreation + m.cacheCreation,
      requests: t.requests + m.requests,
    }),
    { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, requests: 0 }
  );

  return { models, total };
}

export function summarizeModelRouting(db: Database.Database) {
  ensureModelRoutingSchema(db);
  const events = listModelRoutingEvents(db, 200);
  const successful = events.filter((event) => event.success).length;
  const scored = events.filter((event) => event.qualityScore !== null);
  const latencyEvents = events.filter((event) => event.latencyMs !== null);
  return {
    totalRuns: events.length,
    successfulRuns: successful,
    successRate: events.length ? successful / events.length : null,
    averageQuality:
      scored.length > 0
        ? scored.reduce((sum, event) => sum + (event.qualityScore ?? 0), 0) / scored.length
        : null,
    averageLatencyMs:
      latencyEvents.length > 0
        ? Math.round(latencyEvents.reduce((sum, event) => sum + (event.latencyMs ?? 0), 0) / latencyEvents.length)
        : null,
  };
}

function observedStats(events: ModelRoutingEvent[], provider: string, model: string, taskType: string) {
  const matches = events.filter(
    (event) => event.provider === provider && event.model === model && event.taskType === taskType
  );
  const successRate = matches.length
    ? matches.filter((event) => event.success).length / matches.length
    : null;
  const scored = matches.filter((event) => event.qualityScore !== null);
  const latency = matches.filter((event) => event.latencyMs !== null);
  return {
    observations: matches.length,
    successRate,
    averageQuality: scored.length
      ? scored.reduce((sum, event) => sum + (event.qualityScore ?? 0), 0) / scored.length
      : null,
    averageLatencyMs: latency.length
      ? Math.round(latency.reduce((sum, event) => sum + (event.latencyMs ?? 0), 0) / latency.length)
      : null,
  };
}

export function recommendModels(
  db: Database.Database,
  taskType: string,
  strategy: ModelRoutingStrategy = "balanced",
  limit = 4
) {
  ensureModelRoutingSchema(db);
  const events = listModelRoutingEvents(db, 200);
  const normalizedTask = taskType.toLowerCase();
  const candidates = MODEL_CATALOG.filter((entry) => entry.taskTypes.includes(normalizedTask));
  const pool = candidates.length > 0 ? candidates : MODEL_CATALOG;
  const weights =
    strategy === "cost"
      ? { quality: 0.2, cost: 0.55, latency: 0.15, observed: 0.1 }
      : strategy === "quality"
        ? { quality: 0.55, cost: 0.1, latency: 0.1, observed: 0.25 }
        : strategy === "latency"
          ? { quality: 0.2, cost: 0.1, latency: 0.55, observed: 0.15 }
          : { quality: 0.35, cost: 0.25, latency: 0.25, observed: 0.15 };

  return pool
    .map((entry) => {
      const stats = observedStats(events, entry.provider, entry.model, normalizedTask);
      const observedQuality = stats.averageQuality ?? stats.successRate ?? 0.5;
      const score =
        entry.qualityScore * weights.quality +
        entry.costScore * weights.cost +
        entry.latencyScore * weights.latency +
        observedQuality * weights.observed +
        Math.min(stats.observations, 5) * 0.01;
      return {
        ...entry,
        taskType: normalizedTask,
        strategy,
        score: Number(score.toFixed(3)),
        observations: stats.observations,
        successRate: stats.successRate,
        averageQuality: stats.averageQuality,
        averageLatencyMs: stats.averageLatencyMs,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(8, Math.max(1, limit)));
}
