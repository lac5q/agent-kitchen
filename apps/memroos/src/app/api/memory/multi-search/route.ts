import { CLAUDE_MEMORY_PATH } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { searchMeetingCollections } from "@/lib/meeting-qmd-recall";
import { queryGraphMemory, searchVectorMemory } from "@/lib/memory/backends";
import {
  extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems,
  type MemoryUseActor,
} from "@/lib/memory/policy-gate";
import { parseClaudeMemory } from "@/lib/parsers";
import type { MemoryEntry } from "@/types";

export const dynamic = "force-dynamic";

type SearchTier = "vector" | "graph" | "episodic" | "qmd";

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
  ok: boolean;
  count: number;
  error?: string;
}

interface SearchOutcome {
  tier: SearchTier;
  items: NormalizedMemoryResult[];
  error?: string;
}

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const limit = parseLimit(url.searchParams.get("limit"));

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

  const [vector, graph, episodic, qmd]: SearchOutcome[] = await Promise.all([
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
    searchMeetingCollections(query, limit)
      .then((outcome) => ({
        tier: "qmd" as const,
        items: outcome.hits.map((hit) => ({
          id: hit.id,
          tier: "qmd" as const,
          title: hit.title,
          content: hit.content,
          source: `qmd:${hit.collection}`,
          score: hit.score,
          metadata: { collection: hit.collection, path: hit.path, ...(hit.metadata as object) },
        })),
        error: outcome.error,
      }))
      .catch((error) => ({
        tier: "qmd" as const,
        items: [] as NormalizedMemoryResult[],
        error: error instanceof Error ? error.message : "QMD meeting lane unavailable",
      })),
  ]);

  for (const tier of [vector, graph, episodic, qmd]) {
    const authorizedItems = filterAuthorizedMemoryItems(
      db,
      tier.items,
      actor,
      "multi-search",
      (item) => extractMemoryLabelSnapshot(item.metadata),
      (item) => `${item.tier}:${item.id}`
    );
    tiers.push({
      tier: tier.tier,
      ok: !tier.error,
      count: authorizedItems.length,
      error: tier.error,
    });
    results.push(...authorizedItems);
  }

  return Response.json({
    ok: true,
    query,
    tiers,
    results,
    timestamp: new Date().toISOString(),
  });
}
