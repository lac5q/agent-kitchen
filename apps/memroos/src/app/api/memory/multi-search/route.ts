import { CLAUDE_MEMORY_PATH } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { queryGraphMemory, searchVectorMemory } from "@/lib/memory/backends";
import {
  classifyScalar,
  metricEnvelope,
  type MetricEnvelope,
  type MetricScope,
  type MetricStatus,
} from "@/lib/metric-status";
import {
  extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems,
  type MemoryUseActor,
} from "@/lib/memory/policy-gate";
import { parseClaudeMemory } from "@/lib/parsers";
import type { MemoryEntry } from "@/types";

export const dynamic = "force-dynamic";

type SearchTier = "vector" | "graph" | "episodic";

interface NormalizedMemoryResult {
  id: string;
  tier: SearchTier;
  title: string;
  content: string;
  source?: string;
  score?: number;
  metadata?: unknown;
}

interface TierResult {
  tier: SearchTier;
  /** Backwards-compatible: ok === status === "live" or "empty". */
  ok: boolean;
  /** Authorized count (number when successful, 0 when blocked / errored). */
  count: number;
  /** Legacy detail string for older UI consumers. */
  error?: string | null;
  /** Truthful metric envelope. */
  metric: MetricEnvelope<number | null>;
}

interface SearchOutcome {
  tier: SearchTier;
  items: NormalizedMemoryResult[];
  error?: string;
}

const TIER_SOURCES: Record<SearchTier, string> = {
  vector: "mem0-qdrant",
  graph: "neo4j",
  episodic: "claude-memory-jsonl",
};

function parseLimit(raw: string | null): number {
  const parsed = Number(raw ?? 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 25) : 10;
}

function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["memory", "content", "text", "summary", "name", "title", "id"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return JSON.stringify(value);
}

function scoreFrom(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const score = record.score ?? record.similarity ?? record.distance;
  return typeof score === "number" ? score : undefined;
}

function vectorItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  for (const key of ["results", "memories", "data"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeVector(raw: unknown, limit: number): NormalizedMemoryResult[] {
  return vectorItems(raw)
    .slice(0, limit)
    .map((item, index) => ({
      id: `vector-${index}`,
      tier: "vector" as const,
      title: "semantic memory",
      content: textFrom(item),
      source: "mem0 / qdrant",
      score: scoreFrom(item),
      metadata: item,
    }))
    .filter((item) => item.content.trim().length > 0);
}

function normalizeGraph(raw: unknown, limit: number): NormalizedMemoryResult[] {
  const results = !raw || typeof raw !== "object" ? [] : (raw as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];

  const rows = results.flatMap((result) => {
    if (!result || typeof result !== "object") return [];
    const data = (result as Record<string, unknown>).data;
    return Array.isArray(data) ? data : [];
  });

  return rows
    .slice(0, limit)
    .map((row, index) => {
      const values =
        row && typeof row === "object" && Array.isArray((row as Record<string, unknown>).row)
          ? ((row as Record<string, unknown>).row as unknown[])
          : [row];
      const node = values[0];
      const relationships = values[1];
      const neighbors = values[2];
      return {
        id: `graph-${index}`,
        tier: "graph" as const,
        title: "graph memory",
        content: textFrom(node),
        source: "neo4j",
        metadata: { node, relationships, neighbors },
      };
    })
    .filter((item) => item.content.trim().length > 0);
}

function normalizeEpisodic(entries: MemoryEntry[], query: string, limit: number): NormalizedMemoryResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      const haystack = `${entry.content} ${entry.type} ${entry.agent} ${entry.source}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit)
    .map((entry) => ({
      id: `episodic-${entry.id}`,
      tier: "episodic" as const,
      title: `${entry.type} memory`,
      content: entry.content,
      source: entry.source || entry.agent,
      score: entry.score,
      metadata: entry,
    }));
}

function buildTierEnvelope(args: {
  tier: SearchTier;
  sourceOk: boolean;
  error: string | undefined;
  rawCount: number;
  authorizedCount: number;
  scope: MetricScope;
  observedAt: string | null;
}): MetricEnvelope<number | null> {
  const { tier, sourceOk, error, rawCount, authorizedCount, scope, observedAt } = args;

  if (!sourceOk) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source: TIER_SOURCES[tier],
      observedAt,
      scope,
      reason: error ?? `${tier} backend is unreachable`,
    });
  }

  // Source returned but policy gate denied every row (rawCount > 0, authorizedCount = 0)
  if (rawCount > 0 && authorizedCount === 0) {
    return metricEnvelope<number>({
      value: 0,
      status: "blocked",
      source: TIER_SOURCES[tier],
      observedAt,
      scope,
      reason: `${tier} returned ${rawCount} hit(s) but policy gate denied every match for the current viewer`,
    });
  }

  if (authorizedCount === 0) {
    // Healthy source, no hits — distinct from "blocked" and from an errored backend.
    return metricEnvelope<number>({
      value: 0,
      status: "empty",
      source: TIER_SOURCES[tier],
      observedAt,
      scope,
      reason: `${tier} search produced no observations for the query`,
    });
  }

  const classification = classifyScalar({
    rowCount: authorizedCount,
    sourceOk: true,
    latestAt: observedAt,
    freshnessMs: null,
  });
  // classifyScalar returns "live" or "zero" here; force live when we have authorized hits.
  const status: MetricStatus = classification.status === "zero" ? "live" : "live";
  return metricEnvelope<number>({
    value: authorizedCount,
    status,
    source: TIER_SOURCES[tier],
    observedAt,
    scope,
    reason: `${tier} search returned ${authorizedCount} authorized hit(s)`,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const limit = parseLimit(url.searchParams.get("limit"));
  const scope: MetricScope = {
    window: "all",
    workspace: "all",
  };
  const observedAt = new Date().toISOString();

  if (!query) {
    return Response.json({ ok: false, error: "Query is required" }, { status: 400 });
  }

  const tiers: TierResult[] = [];
  const results: NormalizedMemoryResult[] = [];
  const db = getDb();
  const actor: MemoryUseActor = {
    id: "api:memory-multi-search",
    role: "operator",
    capability: "memory_search",
  };

  const [vector, graph, episodic]: SearchOutcome[] = await Promise.all([
    searchVectorMemory(query, limit)
      .then((raw) => ({ tier: "vector" as const, items: normalizeVector(raw, limit) }))
      .catch((error) => ({
        tier: "vector" as const,
        items: [] as NormalizedMemoryResult[],
        error: error instanceof Error ? error.message : "Vector memory backend unavailable",
      })),
    queryGraphMemory(query, limit)
      .then((raw) => ({ tier: "graph" as const, items: normalizeGraph(raw, limit) }))
      .catch((error) => ({
        tier: "graph" as const,
        items: [] as NormalizedMemoryResult[],
        error: error instanceof Error ? error.message : "Graph memory backend unavailable",
      })),
    parseClaudeMemory(CLAUDE_MEMORY_PATH)
      .then((entries) => ({ tier: "episodic" as const, items: normalizeEpisodic(entries, query, limit) }))
      .catch((error) => ({
        tier: "episodic" as const,
        items: [] as NormalizedMemoryResult[],
        error: error instanceof Error ? error.message : "Episodic memory unavailable",
      })),
  ]);

  for (const tier of [vector, graph, episodic]) {
    const tierItems = tier.items;
    const authorizedItems = filterAuthorizedMemoryItems(
      db,
      tierItems,
      actor,
      "multi-search",
      (item) => extractMemoryLabelSnapshot(item.metadata),
      (item) => `${item.tier}:${item.id}`
    );
    const metric = buildTierEnvelope({
      tier: tier.tier,
      sourceOk: !tier.error,
      error: tier.error,
      rawCount: tierItems.length,
      authorizedCount: authorizedItems.length,
      scope,
      observedAt,
    });

    // Backwards-compatible: ok is true when the source itself returned
    // without error. The truthful metric envelope (metric) is the
    // canonical signal for fine-grained UI behavior.
    const sourceOk = !tier.error;
    tiers.push({
      tier: tier.tier,
      ok: sourceOk,
      count: authorizedItems.length,
      error: tier.error ?? (metric.status === "blocked" ? metric.reason : null),
      metric,
    });
    // Only surface results when the operator can actually retrieve them.
    // Empty/blocked/error/degraded tiers must not have a hit list even if
    // the source emitted raw items.
    if (metric.status === "live") {
      for (const item of authorizedItems) results.push(item);
    }
  }

  return Response.json({
    ok: true,
    query,
    tiers,
    results,
    timestamp: observedAt,
  });
}
