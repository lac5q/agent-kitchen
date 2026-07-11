import { getDb } from "@/lib/db";
import { queryGraphMemory } from "@/lib/memory/backends";
import {
  extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems,
  type MemoryUseActor,
} from "@/lib/memory/policy-gate";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function parseLimit(raw: string | null): number {
  const parsed = Number(raw ?? 25);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 100) : 25;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function graphItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  if (Array.isArray(raw.results)) return raw.results;
  return [];
}

function itemTarget(item: unknown, index: number): string {
  if (isRecord(item) && isRecord(item.node) && typeof item.node.id === "string") {
    return `graph:${item.node.id}`;
  }
  return `graph:${index}`;
}

function replaceGraphItems(raw: unknown, items: unknown[]): unknown {
  if (Array.isArray(raw)) return items;
  if (!isRecord(raw)) return raw;
  if (Array.isArray(raw.results)) return { ...raw, results: items };
  return raw;
}

export async function GET(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const result = await queryGraphMemory(query, limit);
    const actor: MemoryUseActor = { id: "api:memory-graph", role: "operator", capability: "memory_search" };
    
    // VAL-MEM-009: Graph filtering removes unauthorized neighbors
    const filteredItems = filterAuthorizedMemoryItems(
      getDb(),
      graphItems(result),
      actor,
      "memory_search",
      extractMemoryLabelSnapshot,
      itemTarget
    ).map((item) => {
      // Filter neighbors within each allowed node
      if (isRecord(item) && Array.isArray(item.neighbors)) {
        const filteredNeighbors = filterAuthorizedMemoryItems(
          getDb(),
          item.neighbors,
          actor,
          "memory_search",
          extractMemoryLabelSnapshot,
          (neighbor, idx) => `graph:neighbor:${isRecord(neighbor) && neighbor.id ? neighbor.id : idx}`
        );
        return { ...item, neighbors: filteredNeighbors };
      }
      return item;
    });

    return Response.json({ 
      ok: true, 
      tier: "graph", 
      result: replaceGraphItems(result, filteredItems), 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    return Response.json(
      { ok: false, tier: "graph", error: error instanceof Error ? error.message : "Graph memory backend unavailable" },
      { status: 502 }
    );
  }
}
